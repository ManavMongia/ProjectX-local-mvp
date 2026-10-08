/**
 * Property Group Service
 * Pure data and business logic for:
 * 1. Automatic property grouping of listings representing the same underlying property
 * 2. Deterministic property identity matching (Coordinates proximity + Location + Type + Beds + Sqft)
 * 3. Property Group creation and relationship assignment (listing -> property_group_id)
 * Zero DOM dependencies; fully reusable across Vanilla JS and React.
 */

import { supabase } from '../core/supabase-client.js';

// Local storage fallback key for resilient offline / unit test environments
const STORAGE_PROPERTY_GROUPS_KEY = 'projectx_property_groups';
let inMemoryGroups = [];

// ─── Local Store Helpers ──────────────────────────────────────────────────────

function getLocalGroups() {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_PROPERTY_GROUPS_KEY);
            if (raw) return JSON.parse(raw);
        }
    } catch {
        // Fall back to memory
    }
    return inMemoryGroups;
}

function saveLocalGroups(groups) {
    inMemoryGroups = groups;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_PROPERTY_GROUPS_KEY, JSON.stringify(groups));
        }
    } catch (e) {
        console.warn('Failed to save local property groups:', e);
    }
}

// ─── 1. Name Generation ───────────────────────────────────────────────────────

/**
 * Generates a standardized property group name matching the existing convention:
 * e.g., "2 Beds Apartment in Mumbai" or "Apartment in Sector 56"
 *
 * @param {Object} listingData
 * @returns {string}
 */
export function generatePropertyGroupName(listingData) {
    if (!listingData) return 'Property Group';

    const beds = listingData.beds && Number(listingData.beds) > 0 ? `${listingData.beds} Beds ` : '';
    const type = (listingData.type || 'Property').trim();
    const location = (listingData.location || '').trim();

    const name = `${beds}${type}${location ? ' in ' + location : ''}`.trim();
    return name || listingData.title || `Property Group ${Date.now()}`;
}

// ─── 2. Deterministic Matching ───────────────────────────────────────────────

/**
 * Checks whether two listings represent the same underlying physical property.
 * Criteria:
 * 1. Coordinates match (within ~15 meters) OR exact normalized location string match
 * 2. Same property type (normalized)
 * 3. Same bedroom count (if specified)
 * 4. Same area / sqft (within tolerance, if specified)
 *
 * @param {Object} a - First listing
 * @param {Object} b - Second listing
 * @returns {boolean}
 */
export function isSameUnderlyingProperty(a, b) {
    if (!a || !b) return false;

    // 1. Location match
    const hasCoordsA = a.lat != null && a.lng != null && Number(a.lat) !== 0 && Number(a.lng) !== 0;
    const hasCoordsB = b.lat != null && b.lng != null && Number(b.lat) !== 0 && Number(b.lng) !== 0;

    let locationMatches = false;

    if (hasCoordsA && hasCoordsB) {
        const latDiff = Math.abs(Number(a.lat) - Number(b.lat));
        const lngDiff = Math.abs(Number(a.lng) - Number(b.lng));
        // 0.00015 degrees is roughly ~15 meters
        if (latDiff < 0.00015 && lngDiff < 0.00015) {
            locationMatches = true;
        } else {
            // Both listings have precise coordinates and they differ -> distinct physical locations
            return false;
        }
    } else if (a.location && b.location) {
        const locA = String(a.location).trim().toLowerCase();
        const locB = String(b.location).trim().toLowerCase();
        if (locA === locB && locA.length > 0) {
            locationMatches = true;
        }
    }

    if (!locationMatches) return false;

    // 2. Property Type Match
    if (a.type && b.type) {
        const typeA = String(a.type).trim().toLowerCase();
        const typeB = String(b.type).trim().toLowerCase();
        if (typeA !== typeB) return false;
    }

    // 3. Bedrooms Match
    if (a.beds != null && b.beds != null) {
        if (Number(a.beds) !== Number(b.beds)) return false;
    }

    // 4. Area / Sqft Match (if both present, must be within +/- 50 sqft)
    if (a.sqft != null && b.sqft != null && Number(a.sqft) > 0 && Number(b.sqft) > 0) {
        if (Math.abs(Number(a.sqft) - Number(b.sqft)) > 50) return false;
    }

    // 5. Bathrooms Match (if both present)
    if (a.baths != null && b.baths != null) {
        if (Number(a.baths) !== Number(b.baths)) return false;
    }

    return true;
}

// ─── 3. Existing Group Lookup ─────────────────────────────────────────────────

/**
 * Searches for an existing property group that matches the given listing.
 * Returns the matching property_group_id, or null if none found.
 *
 * @param {Object} listingData
 * @param {number|string|null} [excludeListingId=null]
 * @returns {Promise<string|null>}
 */
export async function findExistingPropertyGroup(listingData, excludeListingId = null) {
    if (!listingData) return null;

    // Step A: Attempt Supabase query for candidate listings that already have a property_group_id
    try {
        let query = supabase
            .from('listings')
            .select('id, location, lat, lng, type, beds, baths, sqft, property_group_id')
            .not('property_group_id', 'is', null);

        if (excludeListingId != null) {
            query = query.neq('id', excludeListingId);
        }

        // Optimize candidate pool by location if available
        if (listingData.location) {
            query = query.ilike('location', `%${String(listingData.location).trim()}%`);
        }

        const { data: candidates, error } = await query.limit(50);

        if (!error && Array.isArray(candidates) && candidates.length > 0) {
            for (const candidate of candidates) {
                if (isSameUnderlyingProperty(listingData, candidate)) {
                    return candidate.property_group_id;
                }
            }
        }
    } catch {
        // Fall back to local evaluation
    }

    // Step B: Offline / local fallback check
    const localGroups = getLocalGroups();
    for (const group of localGroups) {
        if (Array.isArray(group.listings)) {
            for (const l of group.listings) {
                if (excludeListingId != null && String(l.id) === String(excludeListingId)) continue;
                if (isSameUnderlyingProperty(listingData, l)) {
                    return group.id;
                }
            }
        }
    }

    return null;
}

// ─── 4. Property Group CRUD ───────────────────────────────────────────────────

/**
 * Creates a new property group record in the database.
 *
 * @param {string} groupName
 * @param {string} [id=null]
 * @returns {Promise<{ id: string, name: string, created_at: string }>}
 */
export async function createPropertyGroup(groupName, id = null) {
    const payload = {
        id: id || crypto.randomUUID(),
        name: (groupName || 'Property Group').trim(),
        created_at: new Date().toISOString()
    };

    try {
        const { data, error } = await supabase
            .from('property_groups')
            .insert([payload])
            .select()
            .single();

        if (!error && data) {
            // Update local store cache
            const local = getLocalGroups();
            local.push({ ...data, listings: [] });
            saveLocalGroups(local);
            return data;
        }
    } catch {
        // Fall back to local store
    }

    const local = getLocalGroups();
    local.push({ ...payload, listings: [] });
    saveLocalGroups(local);
    return payload;
}

/**
 * Assigns a listing to a property group by updating its property_group_id column.
 *
 * @param {number|string} listingId
 * @param {string} propertyGroupId
 * @returns {Promise<boolean>}
 */
export async function assignListingToPropertyGroup(listingId, propertyGroupId, listingData = null) {
    if (!listingId || !propertyGroupId) return false;

    try {
        const { error } = await supabase
            .from('listings')
            .update({ property_group_id: propertyGroupId })
            .eq('id', listingId);

        if (error) {
            console.warn('Database assignListingToPropertyGroup warning:', error.message);
        }
    } catch {
        // Fall back
    }

    // Update local store cache
    const local = getLocalGroups();
    const g = local.find(item => item.id === propertyGroupId);
    if (g) {
        if (!Array.isArray(g.listings)) g.listings = [];
        const entry = listingData ? { ...listingData, id: listingId, property_group_id: propertyGroupId } : { id: listingId, property_group_id: propertyGroupId };
        const existingIdx = g.listings.findIndex(item => String(item.id) === String(listingId));
        if (existingIdx >= 0) {
            g.listings[existingIdx] = { ...g.listings[existingIdx], ...entry };
        } else {
            g.listings.push(entry);
        }
        saveLocalGroups(local);
    }
    return true;
}

// ─── 5. Unified Automatic Grouping Pipeline ───────────────────────────────────

/**
 * Authoritative backend function executed whenever a new listing is created.
 *
 * Logic:
 * 1. If listing already has a property_group_id, returns it (idempotent / no duplicate).
 * 2. Searches for an existing property group representing the same underlying property.
 * 3. YES -> Reuses existing property_group_id and associates listing.
 * 4. NO  -> Creates a new property group and associates listing.
 *
 * @param {Object} listingData - The listing attributes
 * @param {number|string|null} [listingId=null] - The ID of the created listing
 * @returns {Promise<{ property_group_id: string, isNewGroup: boolean, groupName: string }>}
 */
export async function groupNewListing(listingData, listingId = null) {
    if (!listingData) {
        throw new Error('Listing data is required for property grouping.');
    }

    const resolvedListingId = listingId || listingData.id || null;

    // 1. Guard: Check if already grouped (idempotent execution)
    if (listingData.property_group_id) {
        return {
            property_group_id: listingData.property_group_id,
            isNewGroup: false,
            groupName: listingData.property_group_name || 'Existing Property Group'
        };
    }

    // 2. Find whether this listing belongs to an existing property group
    const existingGroupId = await findExistingPropertyGroup(listingData, resolvedListingId);

    if (existingGroupId) {
        // Associate with existing group
        if (resolvedListingId != null) {
            await assignListingToPropertyGroup(resolvedListingId, existingGroupId, listingData);
        }
        return {
            property_group_id: existingGroupId,
            isNewGroup: false,
            groupName: generatePropertyGroupName(listingData)
        };
    }

    // 3. Create a new property group
    const groupName = generatePropertyGroupName(listingData);
    const newGroup = await createPropertyGroup(groupName);

    // Associate listing with the new group
    if (resolvedListingId != null && newGroup?.id) {
        await assignListingToPropertyGroup(resolvedListingId, newGroup.id, listingData);
    }

    return {
        property_group_id: newGroup.id,
        isNewGroup: true,
        groupName: newGroup.name
    };
}

// ─── 6. Query Helpers ─────────────────────────────────────────────────────────

/**
 * Fetches all sibling listings belonging to the same property group.
 *
 * @param {string} propertyGroupId
 * @returns {Promise<Array>}
 */
export async function getListingsInPropertyGroup(propertyGroupId) {
    if (!propertyGroupId) return [];

    try {
        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .eq('property_group_id', propertyGroupId)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) return data;
    } catch {
        // Fall back
    }

    const local = getLocalGroups();
    const g = local.find(item => item.id === propertyGroupId);
    return g ? (g.listings || []) : [];
}

/**
 * Fetches property group information by ID.
 *
 * @param {string} propertyGroupId
 * @returns {Promise<Object|null>}
 */
export async function getPropertyGroupById(propertyGroupId) {
    if (!propertyGroupId) return null;

    try {
        const { data, error } = await supabase
            .from('property_groups')
            .select('*')
            .eq('id', propertyGroupId)
            .maybeSingle();

        if (!error && data) return data;
    } catch {
        // Fall back
    }

    const local = getLocalGroups();
    return local.find(item => item.id === propertyGroupId) || null;
}
