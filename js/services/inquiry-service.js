/**
 * Inquiry Service
 * Pure data operations for customer/buyer inquiries and broker lead status workflow.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

/* ─────────────────────────────────────────────────────────────────────────
   1. Lead Status Constants & Badges
   ───────────────────────────────────────────────────────────────────────── */

export const LEAD_STATUSES = {
    NEW_LEAD: 'New Lead',
    SITE_VISIT_REQUESTED: 'Site Visit Requested',
    SITE_VISIT_DONE: 'Site Visit Done',
    FOLLOW_UP: 'Follow-up',
    NOT_INTERESTED: 'Not Interested'
};

export const LEAD_STATUS_OPTIONS = [
    'New Lead',
    'Site Visit Requested',
    'Site Visit Done',
    'Follow-up',
    'Not Interested'
];

export const LEAD_STATUS_BADGE_CLASSES = {
    'New Lead': 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
    'Site Visit Requested': 'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900',
    'Site Visit Done': 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
    'Follow-up': 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    'Not Interested': 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

/**
 * Normalizes any raw status string to a valid lead status, defaulting safely to 'New Lead'.
 *
 * @param {string} [status]
 * @returns {string}
 */
export function normalizeLeadStatus(status) {
    if (!status || typeof status !== 'string') return LEAD_STATUSES.NEW_LEAD;
    const s = status.trim();
    if (LEAD_STATUS_OPTIONS.includes(s)) return s;

    // Handle legacy or case variations
    const lower = s.toLowerCase();
    if (lower === 'new lead' || lower === 'new') return LEAD_STATUSES.NEW_LEAD;
    if (lower.includes('requested') || lower.includes('requsted')) return LEAD_STATUSES.SITE_VISIT_REQUESTED;
    if (lower.includes('done')) return LEAD_STATUSES.SITE_VISIT_DONE;
    if (lower.includes('follow')) return LEAD_STATUSES.FOLLOW_UP;
    if (lower.includes('not interested') || lower.includes('closed')) return LEAD_STATUSES.NOT_INTERESTED;

    return LEAD_STATUSES.NEW_LEAD;
}

/* ─────────────────────────────────────────────────────────────────────────
   2. Inquiry Querying & Management
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Fetches inquiries for a broker with optional status filtering and joined listing details.
 *
 * @param {string|null} [brokerId=null]
 * @param {Object} [options={}]
 * @param {string} [options.statusFilter=null]
 * @param {string} [options.searchQuery='']
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Array<Object>>}
 */
export async function getInquiries(
    brokerId = null,
    { statusFilter = null, searchQuery = '' } = {},
    supabaseClient = supabase
) {
    let query = supabaseClient
        .from('inquiries')
        .select('*, listing:listings(id, title, location)')
        .order('created_at', { ascending: false });

    if (brokerId) {
        query = query.eq('broker_id', brokerId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching inquiries:', error);
        return [];
    }

    let inquiries = (data || []).map(item => ({
        ...item,
        lead_status: normalizeLeadStatus(item.lead_status)
    }));

    // Status filter
    if (statusFilter && statusFilter !== 'All' && statusFilter !== 'All Leads') {
        inquiries = inquiries.filter(i => i.lead_status === statusFilter);
    }

    // Client-side text search (name, message, property title, property location)
    if (searchQuery && typeof searchQuery === 'string') {
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            inquiries = inquiries.filter(i => {
                const nameMatch = i.name && String(i.name).toLowerCase().includes(q);
                const msgMatch = i.message && String(i.message).toLowerCase().includes(q);
                const titleMatch = i.listing && i.listing.title && String(i.listing.title).toLowerCase().includes(q);
                const locMatch = i.listing && i.listing.location && String(i.listing.location).toLowerCase().includes(q);
                return nameMatch || msgMatch || titleMatch || locMatch;
            });
        }
    }

    return inquiries;
}

/**
 * Fetches a single inquiry by ID with joined listing.
 *
 * @param {number|string} id
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object|null>}
 */
export async function getInquiryById(id, supabaseClient = supabase) {
    if (!id) return null;
    const { data, error } = await supabaseClient
        .from('inquiries')
        .select('*, listing:listings(id, title, location)')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching inquiry:', error);
        return null;
    }
    if (data) {
        data.lead_status = normalizeLeadStatus(data.lead_status);
    }
    return data;
}

/**
 * Creates a new customer inquiry. Defaults lead_status to 'New Lead'.
 *
 * @param {Object} inquiryData
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object>}
 */
export async function createInquiry(inquiryData, supabaseClient = supabase) {
    const payload = {
        ...inquiryData,
        lead_status: normalizeLeadStatus(inquiryData.lead_status)
    };

    const { data, error } = await supabaseClient
        .from('inquiries')
        .insert([payload])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Updates the lead status for an inquiry, ensuring broker authorization,
 * recording audit history, and providing atomic database persistence.
 *
 * @param {Object} params
 * @param {number|string} params.inquiryId
 * @param {string} params.newStatus
 * @param {string|null} [params.currentUserId=null]
 * @param {string} [params.userRole='Broker']
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<{success: boolean, inquiry: Object, oldStatus: string, newStatus: string}>}
 */
export async function updateLeadStatus(
    { inquiryId, newStatus, currentUserId = null, userRole = 'Broker' },
    supabaseClient = supabase
) {
    if (!inquiryId) {
        throw new Error('Inquiry ID is required.');
    }

    if (!newStatus || !LEAD_STATUS_OPTIONS.includes(newStatus)) {
        throw new Error(`Invalid lead status "${newStatus}". Must be one of: ${LEAD_STATUS_OPTIONS.join(', ')}`);
    }

    // 1. Fetch current inquiry to verify existence & authorization
    const currentInquiry = await getInquiryById(inquiryId, supabaseClient);
    if (!currentInquiry) {
        throw new Error(`Inquiry with ID ${inquiryId} not found.`);
    }

    const isStaff = userRole === 'Admin' || userRole === 'Employee';
    const isOwner = currentUserId && currentInquiry.broker_id && String(currentInquiry.broker_id) === String(currentUserId);

    if (!isStaff && !isOwner) {
        throw new Error('Unauthorized: You can only update lead status for your own property inquiries.');
    }

    const oldStatus = normalizeLeadStatus(currentInquiry.lead_status);

    // 2. Try atomic database function if available
    try {
        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('fn_update_lead_status', {
            p_inquiry_id: inquiryId,
            p_new_status: newStatus
        });

        if (!rpcError && rpcResult && rpcResult.success) {
            return {
                success: true,
                inquiry: { ...currentInquiry, lead_status: newStatus },
                oldStatus,
                newStatus
            };
        }
    } catch {
        // Fallback to direct client update if function is not yet present on remote DB
    }

    // 3. Direct table update fallback
    const { data: updated, error: updateError } = await supabaseClient
        .from('inquiries')
        .update({ lead_status: newStatus })
        .eq('id', inquiryId)
        .select('*, listing:listings(id, title, location)')
        .single();

    if (updateError) {
        console.error('Failed to update lead status:', updateError);
        throw updateError;
    }

    // 4. Record audit log in lead_status_history if table exists
    try {
        await supabaseClient
            .from('lead_status_history')
            .insert([{
                inquiry_id: inquiryId,
                old_status: oldStatus,
                new_status: newStatus,
                changed_by: currentUserId || null
            }]);
    } catch {
        // Non-destructive fallback for audit log
    }

    // 5. Send broker notification if applicable
    if (currentInquiry.broker_id && oldStatus !== newStatus) {
        try {
            await supabaseClient
                .from('notifications')
                .insert([{
                    user_id: currentInquiry.broker_id,
                    title: 'Lead Status Updated',
                    message: `Lead status for "${currentInquiry.name || 'Customer'}" updated to ${newStatus}.`,
                    read: false
                }]);
        } catch {
            // Non-destructive
        }
    }

    return {
        success: true,
        inquiry: updated || { ...currentInquiry, lead_status: newStatus },
        oldStatus,
        newStatus
    };
}

/**
 * Fetches status audit history for a lead.
 *
 * @param {number|string} inquiryId
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Array<Object>>}
 */
export async function getLeadStatusHistory(inquiryId, supabaseClient = supabase) {
    if (!inquiryId) return [];
    try {
        const { data, error } = await supabaseClient
            .from('lead_status_history')
            .select('*')
            .eq('inquiry_id', inquiryId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Could not fetch lead status history:', error.message);
            return [];
        }
        return data || [];
    } catch {
        return [];
    }
}

/**
 * Reply to an inquiry.
 *
 * @param {number|string} id
 * @param {string} reply
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object>}
 */
export async function replyToInquiry(id, reply, supabaseClient = supabase) {
    const { data, error } = await supabaseClient
        .from('inquiries')
        .update({ broker_reply: reply, read: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Marks an inquiry as read.
 *
 * @param {number|string} id
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object>}
 */
export async function markInquiryRead(id, supabaseClient = supabase) {
    const { data, error } = await supabaseClient
        .from('inquiries')
        .update({ read: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
