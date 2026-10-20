-- ==============================================================================
-- ProjectX: Listing Approval & Moderation Workflow Migration
-- ==============================================================================
-- Requirement:
-- Complete listing approval workflow for Admins and Employees.
-- Statuses: Draft, Pending, Under Review, Active (Approved), Rejected, Suspended.
-- Atomic status updates, mandatory rejection/suspension reasons,
-- audit history logging, and owner notifications.
-- ==============================================================================

-- 1. Ensure assigned_employee_id exists on public.listings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'listings'
          AND column_name = 'assigned_employee_id'
    ) THEN
        ALTER TABLE public.listings
        ADD COLUMN assigned_employee_id UUID REFERENCES public.profiles(id) DEFAULT NULL;
    END IF;
END $$;

-- 2. Indexes for efficient queue filtering and employee assignment lookup
CREATE INDEX IF NOT EXISTS idx_listings_assigned_employee_id ON public.listings(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);

-- 3. Ensure listing_status_history table exists with required schema
CREATE TABLE IF NOT EXISTS public.listing_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id BIGINT NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for status history queries
CREATE INDEX IF NOT EXISTS idx_listing_status_history_listing_id ON public.listing_status_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_status_history_created_at ON public.listing_status_history(created_at DESC);

-- 4. Row Level Security on listing_status_history
ALTER TABLE public.listing_status_history ENABLE ROW LEVEL SECURITY;

-- Staff Policy: Admins and Employees can view all status history records
DROP POLICY IF EXISTS "Staff can view all status histories" ON public.listing_status_history;
CREATE POLICY "Staff can view all status histories"
ON public.listing_status_history
FOR SELECT
USING (
    COALESCE(auth.jwt() ->> 'role', '') IN ('Admin', 'Employee') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
);

-- Broker Policy: Listing owners can view status history of their own listings
DROP POLICY IF EXISTS "Listing owners can view status history" ON public.listing_status_history;
CREATE POLICY "Listing owners can view status history"
ON public.listing_status_history
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.listings
        WHERE listings.id = listing_status_history.listing_id
          AND (listings.broker_id = auth.uid() OR listings.created_by = auth.uid())
    )
);

-- Insert Policy: Authorized actors (Admin, Employee, or listing owner on creation)
DROP POLICY IF EXISTS "Authorized users can insert status history" ON public.listing_status_history;
CREATE POLICY "Authorized users can insert status history"
ON public.listing_status_history
FOR INSERT
WITH CHECK (
    auth.uid() IS NOT NULL AND (
        changed_by = auth.uid() OR
        COALESCE(auth.jwt() ->> 'role', '') IN ('Admin', 'Employee') OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
    )
);

-- 5. Atomic RPC Function: Moderate Listing Status
-- Updates listing status, logs status history, and notifies broker atomically.
CREATE OR REPLACE FUNCTION public.fn_moderate_listing_status(
    p_listing_id BIGINT,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_assigned_employee_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_listing RECORD;
    v_history_id UUID;
    v_notification_id BIGINT;
    v_notif_message TEXT;
    v_clean_reason TEXT;
BEGIN
    -- 1. Identify Caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Employee') THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Admins and Employees can moderate listings.';
    END IF;

    -- 2. Fetch Listing
    SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing #% not found.', p_listing_id;
    END IF;

    v_clean_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

    -- 3. Enforce Permissions by Role
    IF v_caller_role = 'Employee' THEN
        -- Employees cannot suspend listings
        IF p_new_status = 'Suspended' THEN
            RAISE EXCEPTION 'Unauthorized: Employees cannot suspend listings. Suspension is restricted to Administrators.';
        END IF;

        -- Employees cannot reassign listings to other staff
        IF p_assigned_employee_id IS NOT NULL AND p_assigned_employee_id <> v_caller_id THEN
            RAISE EXCEPTION 'Unauthorized: Employees cannot assign listings to other reviewers.';
        END IF;

        -- Employees cannot moderate listings assigned to another employee
        IF v_listing.assigned_employee_id IS NOT NULL AND v_listing.assigned_employee_id <> v_caller_id THEN
            RAISE EXCEPTION 'Unauthorized: This listing is assigned to another reviewer.';
        END IF;

        -- Mandatory reason on rejection
        IF p_new_status = 'Rejected' AND v_clean_reason IS NULL THEN
            RAISE EXCEPTION 'A mandatory reason is required when rejecting a listing.';
        END IF;
    END IF;

    IF v_caller_role = 'Admin' THEN
        IF p_new_status IN ('Rejected', 'Suspended') AND v_clean_reason IS NULL THEN
            RAISE EXCEPTION 'A mandatory reason is required when rejecting or suspending a listing.';
        END IF;
    END IF;

    -- 4. Atomic Listing Update
    UPDATE public.listings
    SET 
        status = p_new_status,
        assigned_employee_id = CASE 
            WHEN p_assigned_employee_id IS NOT NULL THEN p_assigned_employee_id
            -- Auto-claim when employee starts review on unassigned listing
            WHEN v_caller_role = 'Employee' AND p_new_status = 'Under Review' AND v_listing.assigned_employee_id IS NULL THEN v_caller_id
            ELSE assigned_employee_id
        END
    WHERE id = p_listing_id;

    -- 5. Atomic Status History Insert
    INSERT INTO public.listing_status_history (
        listing_id,
        changed_by,
        old_status,
        new_status,
        reason,
        created_at
    ) VALUES (
        p_listing_id,
        v_caller_id,
        v_listing.status,
        p_new_status,
        COALESCE(v_clean_reason, CASE WHEN p_new_status = 'Active' THEN 'Listing approved.' ELSE 'Status updated.' END),
        NOW()
    ) RETURNING id INTO v_history_id;

    -- 6. Atomic Broker Notification
    IF v_listing.broker_id IS NOT NULL THEN
        IF p_new_status = 'Active' THEN
            v_notif_message := 'Your listing "' || v_listing.title || '" has been approved and is now publicly visible.' || 
                CASE WHEN v_clean_reason IS NOT NULL THEN ' Remarks: ' || v_clean_reason ELSE '' END;
        ELSIF p_new_status = 'Rejected' THEN
            v_notif_message := 'Your listing "' || v_listing.title || '" has been rejected. Reason: ' || COALESCE(v_clean_reason, 'Guidelines not met.');
        ELSIF p_new_status = 'Suspended' THEN
            v_notif_message := 'Your listing "' || v_listing.title || '" has been suspended. Reason: ' || COALESCE(v_clean_reason, 'Administrative hold.');
        ELSIF p_new_status = 'Under Review' THEN
            v_notif_message := 'Your listing "' || v_listing.title || '" is now under review by our moderation team.';
        ELSE
            v_notif_message := 'Your listing "' || v_listing.title || '" status has been updated to ' || p_new_status || '.' ||
                CASE WHEN v_clean_reason IS NOT NULL THEN ' Remarks: ' || v_clean_reason ELSE '' END;
        END IF;

        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            read,
            created_at
        ) VALUES (
            v_listing.broker_id,
            'Listing ' || CASE WHEN p_new_status = 'Active' THEN 'Approved' ELSE p_new_status END,
            v_notif_message,
            false,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'listing_id', p_listing_id,
        'old_status', v_listing.status,
        'new_status', p_new_status,
        'history_id', v_history_id
    );
END;
$$;

-- Restrict execution to authenticated users
REVOKE ALL ON FUNCTION public.fn_moderate_listing_status(BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_moderate_listing_status(BIGINT, TEXT, TEXT, UUID) TO authenticated;

