-- ==============================================================================
-- ProjectX: Add available_from Column to Listings Table
-- ==============================================================================
-- Requirement:
-- Add an "Available From" filter to the property search experience.
-- Nullable DATE field representing when a property becomes available.
-- Default intended behavior: available_from <= selected_date
-- Preserves existing records (defaults to NULL, no fabricated dates).
-- ==============================================================================

-- 1. Ensure available_from column exists on public.listings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'listings'
          AND column_name = 'available_from'
    ) THEN
        ALTER TABLE public.listings
        ADD COLUMN available_from DATE DEFAULT NULL;
    END IF;
END $$;

-- 2. Index on available_from for efficient range queries and search performance
CREATE INDEX IF NOT EXISTS idx_listings_available_from ON public.listings(available_from);

COMMENT ON COLUMN public.listings.available_from IS 'The calendar date on which the property becomes available for occupancy or transfer (nullable).';
