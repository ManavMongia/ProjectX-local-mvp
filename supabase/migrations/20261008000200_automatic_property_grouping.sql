-- ==============================================================================
-- ProjectX: Automatic Property Grouping Backend Logic Migration
-- ==============================================================================
-- Purpose:
-- Automatically associates property listings with a property group whenever
-- a new listing is created in the database.
-- Listings representing the same physical property share the same property_group_id.
-- Different properties receive distinct property groups.
-- Does NOT merge, delete, or replace listings.
-- ==============================================================================

-- 1. Ensure property_groups table exists with standard structure
CREATE TABLE IF NOT EXISTS public.property_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure property_group_id column exists on public.listings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'listings' 
          AND column_name = 'property_group_id'
    ) THEN
        ALTER TABLE public.listings 
        ADD COLUMN property_group_id UUID REFERENCES public.property_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Indexes for high-performance grouping lookups
CREATE INDEX IF NOT EXISTS idx_listings_property_group_id ON public.listings(property_group_id);
CREATE INDEX IF NOT EXISTS idx_listings_grouping_coords ON public.listings(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_grouping_loc ON public.listings(LOWER(location)) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_groups_name ON public.property_groups(name);

-- 4. Enable Row Level Security on property_groups
ALTER TABLE public.property_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone (authenticated or anon) can read property groups
DROP POLICY IF EXISTS "Property groups are viewable by everyone" ON public.property_groups;
CREATE POLICY "Property groups are viewable by everyone"
ON public.property_groups FOR SELECT
TO authenticated, anon
USING (true);

-- Ensure direct client creation of property groups is prohibited.
-- All property group creation and assignments occur strictly via the SECURITY DEFINER trigger.
DROP POLICY IF EXISTS "Authenticated users can create property groups" ON public.property_groups;

-- 5. Automatic Grouping Trigger Function
-- Runs BEFORE INSERT on public.listings
-- SECURITY DEFINER allows the function to insert into property_groups and query existing listings
CREATE OR REPLACE FUNCTION public.fn_auto_group_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    matched_group_id UUID;
    generated_name TEXT;
BEGIN
    -- 1. If property_group_id is already assigned, keep it and do nothing
    IF NEW.property_group_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Deterministic Property Identity Matching
    -- Criteria A: Matching physical coordinates (within ~15 meters) + same type + same beds + same sqft + same baths
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL AND NEW.lat <> 0 AND NEW.lng <> 0 THEN
        SELECT property_group_id INTO matched_group_id
        FROM public.listings
        WHERE property_group_id IS NOT NULL
          AND id <> COALESCE(NEW.id, -1)
          AND lat IS NOT NULL AND lng IS NOT NULL
          AND ABS(lat - NEW.lat) < 0.00015
          AND ABS(lng - NEW.lng) < 0.00015
          AND (NEW.type IS NULL OR type IS NULL OR LOWER(TRIM(type)) = LOWER(TRIM(NEW.type)))
          AND (NEW.beds IS NULL OR beds IS NULL OR beds = NEW.beds)
          AND (NEW.sqft IS NULL OR sqft IS NULL OR ABS(sqft - NEW.sqft) <= 50)
          AND (NEW.baths IS NULL OR baths IS NULL OR baths = NEW.baths)
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Criteria B: If not matched by coordinates, match by normalized location string + same type + same beds + same sqft + same baths
    -- Ensure candidates with known conflicting coordinates are NOT falsely matched by text
    IF matched_group_id IS NULL AND NEW.location IS NOT NULL AND TRIM(NEW.location) <> '' THEN
        SELECT property_group_id INTO matched_group_id
        FROM public.listings
        WHERE property_group_id IS NOT NULL
          AND id <> COALESCE(NEW.id, -1)
          AND (NEW.lat IS NULL OR NEW.lng IS NULL OR lat IS NULL OR lng IS NULL OR (ABS(lat - NEW.lat) < 0.00015 AND ABS(lng - NEW.lng) < 0.00015))
          AND location IS NOT NULL
          AND LOWER(TRIM(location)) = LOWER(TRIM(NEW.location))
          AND (NEW.type IS NULL OR type IS NULL OR LOWER(TRIM(type)) = LOWER(TRIM(NEW.type)))
          AND (NEW.beds IS NULL OR beds IS NULL OR beds = NEW.beds)
          AND (NEW.sqft IS NULL OR sqft IS NULL OR ABS(sqft - NEW.sqft) <= 50)
          AND (NEW.baths IS NULL OR baths IS NULL OR baths = NEW.baths)
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- 3. If an existing property group is found, associate it
    IF matched_group_id IS NOT NULL THEN
        NEW.property_group_id := matched_group_id;
        RETURN NEW;
    END IF;

    -- 4. Otherwise, generate a new property group
    -- Pattern: "[Beds] Beds [Type] in [Location]" matching existing convention
    generated_name := TRIM(
        CONCAT(
            CASE WHEN NEW.beds IS NOT NULL AND NEW.beds > 0 THEN NEW.beds || ' Beds ' ELSE '' END,
            COALESCE(NULLIF(TRIM(NEW.type), ''), 'Property'),
            CASE WHEN NEW.location IS NOT NULL AND TRIM(NEW.location) <> '' THEN ' in ' || TRIM(NEW.location) ELSE '' END
        )
    );

    IF generated_name IS NULL OR generated_name = '' THEN
        generated_name := COALESCE(NULLIF(TRIM(NEW.title), ''), 'Property Group ' || gen_random_uuid());
    END IF;

    INSERT INTO public.property_groups (id, name, created_at)
    VALUES (gen_random_uuid(), generated_name, NOW())
    RETURNING id INTO matched_group_id;

    NEW.property_group_id := matched_group_id;
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Non-destructive failure safety: do not block listing creation
        RAISE WARNING 'Property grouping trigger encountered error: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- 6. Attach Trigger to listings table
DROP TRIGGER IF EXISTS trg_auto_group_listing ON public.listings;
CREATE TRIGGER trg_auto_group_listing
BEFORE INSERT ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_group_listing();
