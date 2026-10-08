-- ==============================================================================
-- ProjectX: Listing Sold Out Status & Authorization Migration
-- ==============================================================================
-- Requirement:
-- Give the Broker an option to Mark Listing as Sold Out.
-- Only an authorized broker (or admin/employee) can mark their own listing as sold_out.
-- Status 'sold_out' integrates with the existing listing status architecture.
-- ==============================================================================

-- 1. Index on listings status for efficient filtering and query performance
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);

-- 2. Database Trigger Function: Enforce Broker Authorization on Listing Status Updates
-- Prevents a broker from changing the status of another broker's listing to 'sold_out'
CREATE OR REPLACE FUNCTION public.fn_enforce_listing_broker_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- When status is updated to 'sold_out'
    IF NEW.status = 'sold_out' AND OLD.status IS DISTINCT FROM 'sold_out' THEN
        -- Only enforce when auth.uid() is provided (authenticated client requests)
        IF auth.uid() IS NOT NULL THEN
            IF NOT (
                auth.uid() = OLD.broker_id OR
                auth.uid() = OLD.created_by OR
                COALESCE(auth.jwt() ->> 'role', '') IN ('Admin', 'Employee') OR
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
            ) THEN
                RAISE EXCEPTION 'Unauthorized: Only the authorized broker or platform administrator can mark this listing as Sold Out.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Attach authorization trigger to public.listings
DROP TRIGGER IF EXISTS trg_enforce_listing_broker_authorization ON public.listings;
CREATE TRIGGER trg_enforce_listing_broker_authorization
BEFORE UPDATE OF status ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_listing_broker_authorization();
