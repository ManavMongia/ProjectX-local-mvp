/**
 * Listing Service
 * Pure data operations for property listings.
 * Zero DOM dependencies; reusable across Vanilla JS and React.
 */

import { supabase } from '../core/supabase-client.js';
import { groupNewListing } from './property-group-service.js';

export async function getListings(filters = {}) {
    let query = supabase.from('listings').select('*').order('created_at', { ascending: false });

    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    if (filters.broker_id) {
        query = query.eq('broker_id', filters.broker_id);
    }
    if (filters.intent) {
        query = query.ilike('intent', filters.intent);
    }
    if (filters.type && filters.type !== 'Any') {
        query = query.eq('type', filters.type);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching listings:', error);
        return [];
    }
    return data || [];
}

export async function getListingById(id) {
    if (!id) return null;
    const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching listing by ID:', error);
        return null;
    }
    return data;
}

export async function createListing(listingData) {
    // Security: Listings default to Non-Verified (false). Normal users cannot arbitrarily set is_verified to true.
    const userRole = typeof localStorage !== 'undefined' ? localStorage.getItem('role') : null;
    const isPrivileged = userRole === 'Admin' || userRole === 'Employee';

    const payload = { ...listingData };
    if (!isPrivileged) {
        payload.is_verified = false;
    } else if (payload.is_verified === undefined) {
        payload.is_verified = false;
    }

    const { data, error } = await supabase
        .from('listings')
        .insert([payload])
        .select()
        .single();

    if (error) throw error;

    // Automatic Property Grouping:
    // If the database trigger fn_auto_group_listing already assigned property_group_id on insert,
    // data.property_group_id will already be populated and we do not re-run.
    // If not assigned by the database trigger, execute groupNewListing gracefully as the backend grouping mechanism.
    if (data && !data.property_group_id) {
        try {
            const groupResult = await groupNewListing(data, data.id);
            if (groupResult?.property_group_id) {
                data.property_group_id = groupResult.property_group_id;
            }
        } catch (groupError) {
            // Failure safety: do NOT fail listing creation if grouping fails
            console.warn('Automatic property grouping encountered non-fatal error:', groupError);
        }
    }

    return data;
}

export async function updateListing(id, updates) {
    const { data, error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteListing(id) {
    const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

export async function incrementViewCount(listingId) {
    if (!listingId) return;
    try {
        await supabase.rpc('increment_listing_views', { listing_id: listingId });
    } catch (err) {
        console.error('Failed to increment view count:', err);
    }
}

export async function getFeaturedListings(limit = 3) {
    const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'Active')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching featured listings:', error);
        return [];
    }
    return data || [];
}

// ── Pure Formatting / Calculation Utilities ──

export function formatIntentLabel(intent) {
    if (intent === 'Buy') return 'Sell';
    return intent || '';
}

export function formatListingPrice(price, intent, { html = false } = {}) {
    const p = parseFloat(price);
    if (isNaN(p)) return '—';
    if (intent === 'Rent') {
        const formatted = `₹${p.toLocaleString('en-IN')}`;
        return html
            ? `${formatted}<span class="text-[10px] font-normal text-slate-400">/mo</span>`
            : `${formatted}/mo`;
    }
    if (p >= 1) return `₹${p % 1 === 0 ? p : p.toFixed(2)} Cr`;
    return `₹${(p * 100).toFixed(0)} L`;
}

export function formatListingPriceRange(min, max, intent) {
    const minLabel = min ? formatListingPrice(min, intent) : '0';
    const maxLabel = max ? formatListingPrice(max, intent) : '∞';
    return `${minLabel} - ${maxLabel}`;
}

export function normalizeBrokerageType(value) {
    if (!value) return 'one_time';
    const v = String(value).toLowerCase();
    if (v === 'once' || v === 'one_time') return 'one_time';
    if (v === 'annual' || v === 'annually') return 'annually';
    return value;
}

export function brokerageTypeLabel(value) {
    return normalizeBrokerageType(value) === 'annually' ? 'Annually' : 'One Time';
}

export function calculateListingAge(createdAt) {
    if (!createdAt) return { date: '—', days: null, label: '' };
    const created = new Date(createdAt);
    const diffTime = Date.now() - created.getTime();
    const days = Math.max(0, Math.floor(diffTime / 86400000));
    const date = created.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = days === 0 ? 'Today' : days === 1 ? '1 day old' : `${days} days old`;
    return { date, days, label };
}

// ── Listing Verification Utilities ──

/**
 * Checks whether a listing is verified.
 * Integrates with is_verified, virtually_verified, and field_verified flags.
 * Defaults to false (Non-Verified).
 * 
 * @param {Object} listing
 * @returns {boolean}
 */
export function isListingVerified(listing) {
    if (!listing) return false;
    return Boolean(listing.is_verified || listing.virtually_verified || listing.field_verified);
}

/**
 * Renders consistent HTML badge for listing verification state.
 *
 * @param {boolean} isVerified
 * @param {Object} [options]
 * @returns {string}
 */
export function renderListingVerificationBadge(isVerified, { compact = false } = {}) {
    if (isVerified) {
        return `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs" title="Platform Verified Property">
                <span class="material-symbols-outlined text-[13px] text-emerald-600 font-bold">check_circle</span>
                <span>✓ Verified</span>
            </span>
        `.trim();
    }
    return `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200" title="Non-Verified Listing">
            <span class="material-symbols-outlined text-[13px] text-slate-400">shield</span>
            <span>Non-Verified</span>
        </span>
    `.trim();
}

// ── Listing Sold Out Utilities & Operations ──

/**
 * Checks whether a listing is marked as Sold Out.
 * Supports 'sold_out', 'sold out', and legacy 'sold' case-insensitively.
 *
 * @param {Object|string} listingOrStatus
 * @returns {boolean}
 */
export function isListingSoldOut(listingOrStatus) {
    if (!listingOrStatus) return false;
    const s = typeof listingOrStatus === 'string'
        ? listingOrStatus.trim().toLowerCase()
        : String(listingOrStatus.status || '').trim().toLowerCase();
    return s === 'sold_out' || s === 'sold out' || s === 'sold';
}

/**
 * Normalizes display label for listing status.
 *
 * @param {string} status
 * @returns {string}
 */
export function formatListingStatus(status) {
    if (!status) return 'Draft';
    if (isListingSoldOut(status)) return 'Sold Out';
    const s = status.toLowerCase();
    if (s === 'active') return 'Active';
    if (s === 'pending') return 'Pending';
    if (s === 'flagged') return 'Flagged';
    if (s === 'draft') return 'Draft';
    return status;
}

/**
 * Renders consistent HTML badge for Sold Out state.
 *
 * @param {boolean} isSoldOut
 * @returns {string}
 */
export function renderListingSoldOutBadge(isSoldOut) {
    if (!isSoldOut) return '';
    return `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs" title="Property is no longer available">
            <span class="material-symbols-outlined text-[13px]">do_not_disturb_on</span>
            <span>SOLD OUT</span>
        </span>
    `.trim();
}

/**
 * Marks a listing as Sold Out with strict broker/owner authorization checks.
 *
 * @param {string|number} listingId
 * @returns {Promise<Object>}
 */
export async function markListingSoldOut(listingId) {
    if (!listingId) {
        throw new Error('Listing ID is required to mark listing as Sold Out.');
    }

    // 1. Validate current authenticated user
    let user = null;
    try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
            user = userData.user;
        } else {
            const { data: sessionData } = await supabase.auth.getSession();
            user = sessionData?.session?.user;
        }
    } catch {
        // Fallback
    }

    if (!user && typeof localStorage !== 'undefined') {
        const localUid = localStorage.getItem('userId');
        if (localUid) {
            user = { id: localUid, role: localStorage.getItem('role') };
        }
    }

    if (!user) {
        throw new Error('Authentication required. Please sign in as the authorized broker.');
    }

    // 2. Fetch target listing to verify ownership/assignment
    const listing = await getListingById(listingId);
    if (!listing) {
        throw new Error('Listing not found.');
    }

    // 3. Validate broker authorization
    const userRole = (typeof localStorage !== 'undefined' ? localStorage.getItem('role') : null) || user.role || user.user_metadata?.role;
    const isStaff = userRole === 'Admin' || userRole === 'Employee';
    const isAuthorizedBroker = (
        (listing.broker_id && String(listing.broker_id) === String(user.id)) ||
        (listing.created_by && String(listing.created_by) === String(user.id))
    );

    if (!isAuthorizedBroker && !isStaff) {
        throw new Error('Unauthorized: You can only mark your own listings as Sold Out.');
    }

    // 4. Avoid duplicate/unnecessary state changes if already sold out
    if (isListingSoldOut(listing)) {
        return listing;
    }

    // 5. Update listing status to 'sold_out'
    const { data, error } = await supabase
        .from('listings')
        .update({ status: 'sold_out' })
        .eq('id', listingId)
        .select()
        .single();

    if (error) {
        console.error('Failed to mark listing as sold_out:', error);
        throw new Error(error.message || 'Database update failed when marking listing as Sold Out.');
    }

    return data;
}


