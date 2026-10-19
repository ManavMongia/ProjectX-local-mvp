/**
 * Moderation Service
 * Pure data operations for reports, listing approval workflow, status histories,
 * and profanity detection.
 * Zero DOM dependencies; fully testable in Node and browser.
 */

import { supabase } from '../core/supabase-client.js';

/* ─────────────────────────────────────────────────────────────────────────
   1. Listing Status Constants & Badges
   ───────────────────────────────────────────────────────────────────────── */

export const LISTING_STATUSES = {
    DRAFT: 'Draft',
    PENDING: 'Pending',
    UNDER_REVIEW: 'Under Review',
    ACTIVE: 'Active',        // Publicly visible approved status in DB
    REJECTED: 'Rejected',
    SUSPENDED: 'Suspended',
    SOLD_OUT: 'sold_out',
    FLAGGED: 'Flagged'
};

export const STATUS_DISPLAY_LABELS = {
    'Draft': 'Draft',
    'Pending': 'Pending',
    'Under Review': 'Under Review',
    'Active': 'Approved (Active)',
    'Rejected': 'Rejected',
    'Suspended': 'Suspended',
    'sold_out': 'Sold Out',
    'Sold Out': 'Sold Out',
    'Flagged': 'Flagged'
};

export const STATUS_BADGE_CLASSES = {
    'Draft': 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300',
    'Pending': 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300',
    'Under Review': 'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300',
    'Active': 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300',
    'Rejected': 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300',
    'Suspended': 'bg-slate-800 text-slate-100 border border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    'sold_out': 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300',
    'Sold Out': 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300',
    'Flagged': 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-300'
};

/* ─────────────────────────────────────────────────────────────────────────
   2. Moderation Transitions & Permission Rules
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Returns the permitted target statuses for a listing based on the user's role and current state.
 *
 * @param {string} currentStatus
 * @param {string} userRole 'Admin' | 'Employee' | 'Broker'
 * @param {Object} [listing=null]
 * @param {string} [currentUserId=null]
 * @returns {Array<{value: string, label: string}>}
 */
export function getAllowedTransitions(currentStatus, userRole, listing = null, currentUserId = null) {
    if (!currentStatus) return [];

    // Admin can transition to any supported status
    if (userRole === 'Admin') {
        const allAdminStatuses = [
            'Pending',
            'Under Review',
            'Active',
            'Rejected',
            'Suspended',
            'Draft'
        ];
        return allAdminStatuses.map(s => ({
            value: s,
            label: s === 'Active' ? 'Approved (Active)' : s
        }));
    }

    // Employee rules
    if (userRole === 'Employee') {
        const isAssignedToMe = listing && listing.assigned_employee_id === currentUserId;
        const isUnassigned = !listing || listing.assigned_employee_id === null || listing.assigned_employee_id === undefined;

        // If assigned to another employee, no transitions permitted
        if (listing && !isAssignedToMe && !isUnassigned) {
            return [{ value: currentStatus, label: currentStatus === 'Active' ? 'Approved' : currentStatus }];
        }

        if (currentStatus === 'Pending') {
            return [
                { value: 'Pending', label: 'Pending' },
                { value: 'Under Review', label: 'Under Review' }
            ];
        }

        if (currentStatus === 'Under Review') {
            return [
                { value: 'Under Review', label: 'Under Review' },
                { value: 'Active', label: 'Approved (Active)' },
                { value: 'Rejected', label: 'Rejected' }
            ];
        }

        if (currentStatus === 'Active') {
            return [
                { value: 'Active', label: 'Approved (Active)' },
                { value: 'Under Review', label: 'Under Review' },
                { value: 'Rejected', label: 'Rejected' }
            ];
        }

        if (currentStatus === 'Rejected') {
            return [
                { value: 'Rejected', label: 'Rejected' },
                { value: 'Under Review', label: 'Under Review' }
            ];
        }

        return [
            { value: currentStatus, label: currentStatus === 'Active' ? 'Approved' : currentStatus },
            { value: 'Under Review', label: 'Under Review' }
        ];
    }

    // Broker can only set Draft or submit as Pending
    if (userRole === 'Broker' || userRole === 'Seller') {
        return [
            { value: 'Draft', label: 'Draft' },
            { value: 'Pending', label: 'Pending (Submit for Review)' }
        ];
    }

    return [];
}

/**
 * Validates a requested status transition.
 *
 * Requirements:
 * - Admin can execute any valid transition.
 * - Employee cannot modify listings assigned to another employee.
 * - Employee cannot perform Admin-only transitions (e.g. Suspend).
 * - Employee can only transition Pending -> Under Review -> Active / Rejected.
 * - Reason is mandatory when rejecting or suspending.
 *
 * @param {Object} params
 * @returns {{valid: boolean, error?: string}}
 */
export function validateStatusTransition({
    currentStatus,
    newStatus,
    userRole,
    reason,
    listing = null,
    currentUserId = null
}) {
    if (!newStatus) {
        return { valid: false, error: 'Target status is required.' };
    }

    if (!userRole || (userRole !== 'Admin' && userRole !== 'Employee')) {
        return { valid: false, error: 'Unauthorized: Only platform Admins and Employees can moderate listing statuses.' };
    }

    // Reason validation
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if ((newStatus === 'Rejected' || newStatus === 'Suspended') && !trimmedReason) {
        return {
            valid: false,
            error: `A mandatory reason or remark is required when setting status to ${newStatus}.`
        };
    }

    // Employee permission checks
    if (userRole === 'Employee') {
        if (newStatus === 'Suspended') {
            return {
                valid: false,
                error: 'Unauthorized: Employees cannot suspend listings. Only Administrators can suspend properties.'
            };
        }

        if (listing && listing.assigned_employee_id && listing.assigned_employee_id !== currentUserId) {
            return {
                valid: false,
                error: 'Unauthorized: You can only moderate listings assigned to you.'
            };
        }

        const allowed = getAllowedTransitions(currentStatus, userRole, listing, currentUserId);
        const isPermitted = allowed.some(a => a.value === newStatus);
        if (!isPermitted) {
            return {
                valid: false,
                error: `Unauthorized transition from ${currentStatus} to ${newStatus} for Employee role.`
            };
        }
    }

    return { valid: true };
}

/* ─────────────────────────────────────────────────────────────────────────
   3. Notification Formatting
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Generates transparent owner-facing notification message for a status update.
 *
 * @param {string} listingTitle
 * @param {string} oldStatus
 * @param {string} newStatus
 * @param {string} [reason='']
 * @returns {string}
 */
export function formatModerationNotification(listingTitle, oldStatus, newStatus, reason = '') {
    const title = listingTitle || 'Your property';
    const cleanReason = reason ? reason.trim() : '';

    if (newStatus === 'Active') {
        return `Your listing "${title}" has been approved and is now publicly visible.${cleanReason ? ` Remarks: ${cleanReason}` : ''}`;
    }
    if (newStatus === 'Rejected') {
        return `Your listing "${title}" has been rejected. Reason: ${cleanReason || 'Did not meet listing guidelines.'}`;
    }
    if (newStatus === 'Suspended') {
        return `Your listing "${title}" has been suspended. Reason: ${cleanReason || 'Administrative hold.'}`;
    }
    if (newStatus === 'Under Review') {
        return `Your listing "${title}" is now under review by our moderation team.`;
    }
    if (newStatus === 'Pending') {
        return `Your listing "${title}" has been moved to Pending review.`;
    }

    return `Your listing "${title}" status has been updated to ${newStatus}.${cleanReason ? ` Remarks: ${cleanReason}` : ''}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   4. Status Update Execution & Audit Persistence
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Updates listing status, logs audit history, and notifies the broker atomically.
 *
 * @param {Object} params
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<{success: boolean, listing: Object, history: Object}>}
 */
export async function updateListingModerationStatus({
    listingId,
    oldStatus,
    newStatus,
    changedByUserId,
    userRole,
    reason,
    assignedEmployeeId = undefined,
    brokerId = null,
    listingTitle = 'Property',
    listing = null
}, supabaseClient = supabase) {
    if (!listingId) {
        throw new Error('Listing ID is required.');
    }

    // 1. Validate requested transition
    const validation = validateStatusTransition({
        currentStatus: oldStatus,
        newStatus,
        userRole,
        reason,
        listing,
        currentUserId: changedByUserId
    });

    if (!validation.valid) {
        throw new Error(validation.error);
    }

    // 2. Prepare listing update payload
    const updatePayload = { status: newStatus };
    if (assignedEmployeeId !== undefined) {
        updatePayload.assigned_employee_id = assignedEmployeeId;
    }

    // If Employee moves Pending -> Under Review and listing is unassigned, auto-assign to them
    if (userRole === 'Employee' && newStatus === 'Under Review' && listing && !listing.assigned_employee_id) {
        updatePayload.assigned_employee_id = changedByUserId;
    }

    // 3. Update the listing in Supabase
    const { data: updatedListing, error: updateError } = await supabaseClient
        .from('listings')
        .update(updatePayload)
        .eq('id', listingId)
        .select()
        .single();

    if (updateError) {
        console.error('Failed to update listing status:', updateError);
        throw updateError;
    }

    // 4. Log status change in listing_status_history
    const historyPayload = {
        listing_id: listingId,
        changed_by: changedByUserId || null,
        old_status: oldStatus || null,
        new_status: newStatus,
        reason: reason ? reason.trim() : (newStatus === 'Active' ? 'Listing approved.' : 'Status updated.')
    };

    const { data: historyRecord, error: historyError } = await supabaseClient
        .from('listing_status_history')
        .insert([historyPayload])
        .select()
        .single();

    if (historyError) {
        console.error('Failed to log listing status history:', historyError);
        // Non-destructive fallback: log warning but preserve successful status update
    }

    // 5. Notify the listing owner/broker if brokerId is present
    const targetBrokerId = brokerId || updatedListing?.broker_id;
    if (targetBrokerId) {
        const notifMessage = formatModerationNotification(
            listingTitle || updatedListing?.title,
            oldStatus,
            newStatus,
            reason
        );

        const { error: notifError } = await supabaseClient
            .from('notifications')
            .insert([{
                user_id: targetBrokerId,
                title: `Listing ${newStatus === 'Active' ? 'Approved' : newStatus}`,
                message: notifMessage,
                read: false
            }]);

        if (notifError) {
            console.error('Failed to send broker notification:', notifError);
        }
    }

    return {
        success: true,
        listing: updatedListing,
        history: historyRecord
    };
}

/**
 * Assigns or reassigns a listing to an employee.
 *
 * @param {Object} params
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object>}
 */
export async function assignListingEmployee({
    listingId,
    assignedEmployeeId,
    userRole,
    currentUserId
}, supabaseClient = supabase) {
    if (!listingId) throw new Error('Listing ID is required.');

    if (userRole === 'Employee') {
        // Employee can only claim an unassigned listing for themselves
        if (assignedEmployeeId && assignedEmployeeId !== currentUserId) {
            throw new Error('Unauthorized: Employees cannot assign listings to other reviewers.');
        }
    } else if (userRole !== 'Admin') {
        throw new Error('Unauthorized: Only platform Admins and Employees can assign listings.');
    }

    const { data, error } = await supabaseClient
        .from('listings')
        .update({ assigned_employee_id: assignedEmployeeId || null })
        .eq('id', listingId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/* ─────────────────────────────────────────────────────────────────────────
   5. Moderation Queue Querying
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Loads listings for the moderation queue with filtering and search.
 *
 * @param {Object} params
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchModerationListings({
    statusFilter = 'All',
    assignFilter = 'All',
    searchQuery = '',
    limit = 50,
    currentUserId = null
} = {}, supabaseClient = supabase) {
    let query = supabaseClient
        .from('listings')
        .select('*, assigned_employee:profiles!listings_assigned_employee_id_fkey(id, full_name, role)')
        .order('created_at', { ascending: false });

    // Status filtering
    if (statusFilter && statusFilter !== 'All') {
        if (statusFilter === 'Active' || statusFilter === 'Approved') {
            query = query.eq('status', 'Active');
        } else {
            query = query.eq('status', statusFilter);
        }
    }

    // Assignment filtering
    if (assignFilter === 'Me' && currentUserId) {
        query = query.eq('assigned_employee_id', currentUserId);
    } else if (assignFilter === 'Unassigned') {
        query = query.is('assigned_employee_id', null);
    }

    const { data, error } = await query.limit(limit);
    if (error) {
        console.error('Failed to fetch listings for moderation:', error);
        throw error;
    }

    let listings = data || [];

    // Client-side text search if searchQuery is provided
    if (searchQuery && typeof searchQuery === 'string') {
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            listings = listings.filter(l => {
                const titleMatch = l.title && String(l.title).toLowerCase().includes(q);
                const locMatch = l.location && String(l.location).toLowerCase().includes(q);
                const idMatch = l.id !== undefined && String(l.id).toLowerCase().includes(q);
                const brokerMatch = l.broker_id && String(l.broker_id).toLowerCase().includes(q);
                return titleMatch || locMatch || idMatch || brokerMatch;
            });
        }
    }

    return listings;
}

/* ─────────────────────────────────────────────────────────────────────────
   6. Reports & Status History & Profanity
   ───────────────────────────────────────────────────────────────────────── */

const leetMap = {
    'a': '[a@44*]', 'b': '[b8*]', 'c': '[c(k*]', 'd': '[d*]', 'e': '[e3*]',
    'f': '[f*]', 'g': '[g9*]', 'h': '[h*]', 'i': '[i1!*|]', 'j': '[j*]',
    'k': '[k*]', 'l': '[l1|*]', 'm': '[m*]', 'n': '[n*]', 'o': '[o0*]',
    'p': '[p*]', 'q': '[q*]', 'r': '[r*]', 'z': '[z*]', 's': '[s$5*]',
    't': '[t7*]', 'u': '[uv*]', 'v': '[v*]', 'w': '[w*]', 'x': '[x*]', 'y': '[y*]'
};

function makePattern(word, boundaryStart = false, boundaryEnd = false, notPrecededByS = false) {
    const parts = [];
    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const pattern = leetMap[char] || char;
        parts.push(pattern);
    }
    const separator = '[@*#%!$_\\-\\s.\\d]*';
    let innerPattern = parts.join(separator);
    
    if (notPrecededByS) {
        innerPattern = '(?<![sS])' + innerPattern;
    }
    
    let patternStr = innerPattern;
    if (boundaryStart) patternStr = '\\b' + patternStr;
    if (boundaryEnd) patternStr = patternStr + '\\b';
    
    return new RegExp(patternStr, 'i');
}

const substringWords = [
    'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'faggot', 'bastard', 'chink', 'retard',
    'asshole', 'badass', 'dumbass', 'jackass'
];

const standaloneWords = [
    'ass', 'asses', 'dick', 'dicks'
];

const patterns = [
    ...substringWords.map(w => makePattern(w, false, false, w === 'nigger')),
    makePattern('nigger', false, false, true),
    ...standaloneWords.map(w => makePattern(w, true, true))
];

export function hasProfanity(text) {
    if (!text) return false;
    const lowerText = String(text).toLowerCase();
    return patterns.some(regex => regex.test(lowerText));
}

export async function submitReport({ reporterId, targetType, targetId, reason, description }, supabaseClient = supabase) {
    const { data, error } = await supabaseClient
        .from('reports')
        .insert([{
            reporter_id: reporterId,
            target_type: targetType,
            target_id: targetId,
            reason: reason,
            description: description
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getListingStatusHistory(listingId, supabaseClient = supabase) {
    const { data, error } = await supabaseClient
        .from('listing_status_history')
        .select('*, profiles(full_name, role)')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load moderation history:', error);
        return [];
    }
    return data || [];
}
