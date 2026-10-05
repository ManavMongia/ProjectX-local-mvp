/**
 * Listing Service
 * Pure data operations for property listings.
 * Zero DOM dependencies; reusable across Vanilla JS and React.
 */

import { supabase } from '../core/supabase-client.js';

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
    const { data, error } = await supabase
        .from('listings')
        .insert([listingData])
        .select()
        .single();

    if (error) throw error;
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
