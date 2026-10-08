-- ==============================================================================
-- ProjectX: Listing Verification Status Migration
-- ==============================================================================
-- Requirement:
-- Listings have ONLY a Verified / Non-Verified badge.
-- Ratings are strictly for Brokers, not listings.
-- Listings default to Non-Verified (false).
-- Clients cannot arbitrarily mark listings as verified; verification is
-- restricted to platform Admin / Employee moderation.
-- ==============================================================================

-- 1. Add is_verified column to listings table with default false
ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for filtering verified properties
CREATE INDEX IF NOT EXISTS idx_listings_is_verified ON public.listings(is_verified);

-- 3. Security Trigger Function to prevent unauthorized client verification
-- Ensures normal users cannot arbitrarily set is_verified to true from the browser
CREATE OR REPLACE FUNCTION public.fn_prevent_client_listing_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- On INSERT: enforce is_verified = false unless caller has Admin/Employee role
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_verified IS TRUE THEN
            IF NOT (
                COALESCE(auth.jwt() ->> 'role', '') IN ('Admin', 'Employee') OR
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
            ) THEN
                NEW.is_verified := false;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- On UPDATE: prevent non-admins from modifying is_verified
    IF TG_OP = 'UPDATE' THEN
        IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
            IF NOT (
                COALESCE(auth.jwt() ->> 'role', '') IN ('Admin', 'Employee') OR
                EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Employee'))
            ) THEN
                NEW.is_verified := OLD.is_verified;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Attach security trigger to listings table
DROP TRIGGER IF EXISTS trg_prevent_client_listing_verification ON public.listings;
CREATE TRIGGER trg_prevent_client_listing_verification
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_client_listing_verification();
