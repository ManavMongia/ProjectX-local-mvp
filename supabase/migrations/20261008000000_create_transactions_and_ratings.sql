-- ==============================================================================
-- ProjectX: Transaction-Based Rating and Review System Migration
-- Enforces: NO COMPLETED DEAL -> NO RATING
-- ==============================================================================

-- 1. Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id BIGINT REFERENCES public.listings(id) ON DELETE SET NULL,
    broker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Sale', 'Rental')),
    amount NUMERIC,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_broker ON public.transactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON public.transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON public.transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_listing ON public.transactions(listing_id);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Transaction RLS Policies
DROP POLICY IF EXISTS "Users can view transactions they participate in" ON public.transactions;
CREATE POLICY "Users can view transactions they participate in"
ON public.transactions FOR SELECT
TO authenticated, anon
USING (
    auth.uid() IS NULL OR
    auth.uid() = broker_id OR
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
);

DROP POLICY IF EXISTS "Brokers and Sellers can create transactions" ON public.transactions;
CREATE POLICY "Brokers and Sellers can create transactions"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = broker_id OR
    auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
);

DROP POLICY IF EXISTS "Participants can update their transactions" ON public.transactions;
CREATE POLICY "Participants can update their transactions"
ON public.transactions FOR UPDATE
TO authenticated
USING (
    auth.uid() = broker_id OR
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);

-- 2. Create ratings table
CREATE TABLE IF NOT EXISTS public.ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    rater_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rated_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_rating CHECK (rater_id <> rated_user_id),
    CONSTRAINT uq_transaction_rater_target UNIQUE (transaction_id, rater_id, rated_user_id)
);

-- Indexes for rating queries
CREATE INDEX IF NOT EXISTS idx_ratings_rated_user ON public.ratings(rated_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater ON public.ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_transaction ON public.ratings(transaction_id);

-- Enable RLS on ratings
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- Read ratings: Publicly readable for trust and transparency
DROP POLICY IF EXISTS "Ratings are viewable by everyone" ON public.ratings;
CREATE POLICY "Ratings are viewable by everyone"
ON public.ratings FOR SELECT
TO authenticated, anon
USING (true);

-- Insert rating:
-- CRITICAL SECURITY ENFORCEMENT:
-- 1. Must be authenticated as rater_id
-- 2. Cannot rate yourself (rater_id <> rated_user_id)
-- 3. The transaction MUST exist and have status = 'completed'
-- 4. BOTH rater_id and rated_user_id MUST have participated in the same transaction
DROP POLICY IF EXISTS "Users can rate completed transactions they participated in" ON public.ratings;
CREATE POLICY "Users can rate completed transactions they participated in"
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = rater_id AND
    rater_id <> rated_user_id AND
    EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND t.status = 'completed'
          AND (t.broker_id = rater_id OR t.buyer_id = rater_id OR t.seller_id = rater_id)
          AND (t.broker_id = rated_user_id OR t.buyer_id = rated_user_id OR t.seller_id = rated_user_id)
    )
);

-- Update rating: original rater only
DROP POLICY IF EXISTS "Users can update their own ratings" ON public.ratings;
CREATE POLICY "Users can update their own ratings"
ON public.ratings FOR UPDATE
TO authenticated
USING (auth.uid() = rater_id)
WITH CHECK (auth.uid() = rater_id);

-- Delete rating: only Admins
DROP POLICY IF EXISTS "Only admins can delete ratings" ON public.ratings;
CREATE POLICY "Only admins can delete ratings"
ON public.ratings FOR DELETE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);
