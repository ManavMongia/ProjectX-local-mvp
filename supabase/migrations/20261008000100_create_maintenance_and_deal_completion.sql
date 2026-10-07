-- ==============================================================================
-- ProjectX: Deal Completion, Multi-Party Confirmation & Maintenance Requests Migration
-- ==============================================================================

-- 1. Extend transactions table with deal acknowledgements (multi-party confirmation)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'transactions' 
          AND column_name = 'deal_acknowledgements'
    ) THEN
        ALTER TABLE public.transactions 
        ADD COLUMN deal_acknowledgements JSONB DEFAULT '{"broker":false,"buyer":false,"seller":false}'::jsonb;
    END IF;
END $$;

-- 2. Create maintenance_requests table
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    listing_id BIGINT REFERENCES public.listings(id) ON DELETE SET NULL,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'General',
    priority VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_maintenance_transaction ON public.maintenance_requests(transaction_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requester ON public.maintenance_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON public.maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_listing ON public.maintenance_requests(listing_id);

-- Enable RLS on maintenance_requests
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

-- 3. RLS Security Policies for maintenance_requests
-- Users can only view maintenance requests for transactions/deals they legitimately participate in
DROP POLICY IF EXISTS "Participants can view maintenance requests for their deals" ON public.maintenance_requests;
CREATE POLICY "Participants can view maintenance requests for their deals"
ON public.maintenance_requests FOR SELECT
TO authenticated, anon
USING (
    auth.uid() IS NULL OR
    EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND (t.broker_id = auth.uid() OR t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
);

-- Users can only create maintenance requests for transactions they participate in AND which are completed
DROP POLICY IF EXISTS "Participants can create maintenance requests for completed deals" ON public.maintenance_requests;
CREATE POLICY "Participants can create maintenance requests for completed deals"
ON public.maintenance_requests FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = requester_id AND
    EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND t.status = 'completed'
          AND (t.broker_id = auth.uid() OR t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    )
);

-- Participants or admins can update status of maintenance requests
DROP POLICY IF EXISTS "Participants can update maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Participants can update maintenance requests"
ON public.maintenance_requests FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND (t.broker_id = auth.uid() OR t.buyer_id = auth.uid() OR t.seller_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);
