-- ==============================================================================
-- ProjectX Migration: Enforce Listing Public Visibility & Row Level Security
-- ==============================================================================
-- 1. Anonymous / Public users can only read 'Active' and 'sold_out' listings.
-- 2. Listing owners (broker_id or created_by) can read and manage their own listings.
-- 3. Platform staff (Admin and Employee) can read all listings for moderation.
-- 4. Uses a secure security-definer helper to prevent recursive profiles RLS queries.
-- ==============================================================================

-- 1. Staff role validation helper function (Non-recursive, secure search_path)
CREATE OR REPLACE FUNCTION public.fn_is_staff_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    IF user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id
          AND role IN ('Admin', 'Employee')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_is_staff_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_staff_user(UUID) TO authenticated, anon;

-- 2. Enable Row Level Security on public.listings
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing permissive or conflicting SELECT policies
DROP POLICY IF EXISTS "Public can view active or sold_out listings" ON public.listings;
DROP POLICY IF EXISTS "Listings are viewable by everyone" ON public.listings;
DROP POLICY IF EXISTS "Public listings visibility" ON public.listings;
DROP POLICY IF EXISTS "Allow public read access" ON public.listings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.listings;
DROP POLICY IF EXISTS "Public listings read policy" ON public.listings;

-- 4. Create strictly scoped SELECT policy
CREATE POLICY "Public listings visibility"
ON public.listings
FOR SELECT
USING (
    -- Publicly permitted listings
    status IN ('Active', 'sold_out')
    -- Or authenticated owner of the listing
    OR (auth.uid() IS NOT NULL AND (
        broker_id = auth.uid()
        OR (created_by IS NOT NULL AND created_by = auth.uid())
        OR public.fn_is_staff_user(auth.uid())
    ))
);

-- 5. Scoped INSERT policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can create listings" ON public.listings;
DROP POLICY IF EXISTS "Brokers and sellers can insert listings" ON public.listings;

CREATE POLICY "Authenticated users can create listings"
ON public.listings
FOR INSERT
WITH CHECK (
    auth.uid() IS NOT NULL
);

-- 6. Scoped UPDATE policy: Owners and Staff only
DROP POLICY IF EXISTS "Listing owners and staff can update listings" ON public.listings;
DROP POLICY IF EXISTS "Brokers can update their own listings" ON public.listings;

CREATE POLICY "Listing owners and staff can update listings"
ON public.listings
FOR UPDATE
USING (
    auth.uid() IS NOT NULL AND (
        broker_id = auth.uid()
        OR (created_by IS NOT NULL AND created_by = auth.uid())
        OR public.fn_is_staff_user(auth.uid())
    )
)
WITH CHECK (
    auth.uid() IS NOT NULL AND (
        broker_id = auth.uid()
        OR (created_by IS NOT NULL AND created_by = auth.uid())
        OR public.fn_is_staff_user(auth.uid())
    )
);

-- 7. Scoped DELETE policy: Listing owners and Admins only
DROP POLICY IF EXISTS "Listing owners and admins can delete listings" ON public.listings;
DROP POLICY IF EXISTS "Brokers can delete their own listings" ON public.listings;

CREATE POLICY "Listing owners and admins can delete listings"
ON public.listings
FOR DELETE
USING (
    auth.uid() IS NOT NULL AND (
        broker_id = auth.uid()
        OR (created_by IS NOT NULL AND created_by = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'Admin'
        )
    )
);
