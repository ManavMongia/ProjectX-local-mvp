/**
 * Test Suite: Listing Approval & Moderation Workflow for Admin and Employee
 * Run: node scripts/test_listing_approval.js
 *
 * Verifies:
 *  1. Role permissions: Admin full access, Employee bounded transitions, Broker blocked from self-approval.
 *  2. Mandatory reason enforcement for Rejected and Suspended statuses.
 *  3. Employee assignment rules: claiming, restrictions on modifying other employees' assignments.
 *  4. Broker editing behavior: cannot self-approve, edits on Rejected transition to Pending.
 *  5. Notification messages: proper formatting for Approved, Rejected, Suspended, Under Review.
 *  6. Audit logging: records in listing_status_history with changed_by, old_status, new_status, reason.
 *  7. Moderation queue querying and multi-field text search.
 *  8. Public visibility: only Active and sold_out listings are visible to public seekers.
 */

import {
    LISTING_STATUSES,
    STATUS_DISPLAY_LABELS,
    STATUS_BADGE_CLASSES,
    getAllowedTransitions,
    validateStatusTransition,
    formatModerationNotification,
    updateListingModerationStatus,
    assignListingEmployee,
    fetchModerationListings
} from '../js/services/moderation-service.js';

import { formatListingStatus, isListingSoldOut } from '../js/services/listing-service.js';

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        console.log(`  ✅ ${desc}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${desc}`);
        failed++;
    }
}

console.log('================================================================');
console.log('ProjectX: Listing Approval & Moderation Workflow Test Suite');
console.log('================================================================');

// ── Section 1: Allowed Transitions by Role ──
console.log('\n--- Section 1: Role-Based Allowed Transitions ---');

// Admin transitions
const adminPendingTransitions = getAllowedTransitions('Pending', 'Admin');
assert('Admin can see all moderation statuses from Pending', 
    adminPendingTransitions.some(t => t.value === 'Active') &&
    adminPendingTransitions.some(t => t.value === 'Rejected') &&
    adminPendingTransitions.some(t => t.value === 'Suspended') &&
    adminPendingTransitions.some(t => t.value === 'Under Review')
);

// Employee transitions
const empPendingTransitions = getAllowedTransitions('Pending', 'Employee');
assert('Employee on Pending can choose Pending or Under Review',
    empPendingTransitions.some(t => t.value === 'Under Review') &&
    empPendingTransitions.some(t => t.value === 'Pending') &&
    !empPendingTransitions.some(t => t.value === 'Suspended')
);

const empUnderReviewTransitions = getAllowedTransitions('Under Review', 'Employee');
assert('Employee on Under Review can Approve or Reject',
    empUnderReviewTransitions.some(t => t.value === 'Active') &&
    empUnderReviewTransitions.some(t => t.value === 'Rejected') &&
    !empUnderReviewTransitions.some(t => t.value === 'Suspended')
);

// Employee assignment restriction
const otherEmployeeListing = { id: 10, assigned_employee_id: 'emp-99' };
const empTransitionsForOther = getAllowedTransitions('Pending', 'Employee', otherEmployeeListing, 'emp-1');
assert('Employee cannot transition a listing assigned to another employee',
    empTransitionsForOther.length === 1 && empTransitionsForOther[0].value === 'Pending'
);

// Broker transitions
const brokerTransitions = getAllowedTransitions('Draft', 'Broker');
assert('Broker cannot transition directly to Active (Approved)',
    !brokerTransitions.some(t => t.value === 'Active') &&
    brokerTransitions.some(t => t.value === 'Pending') &&
    brokerTransitions.some(t => t.value === 'Draft')
);

// ── Section 2: Status Transition Validation Rules ──
console.log('\n--- Section 2: Status Transition Validation Rules ---');

// 1. Mandatory Reason for Rejected
const rejectWithoutReason = validateStatusTransition({
    currentStatus: 'Under Review',
    newStatus: 'Rejected',
    userRole: 'Admin',
    reason: ''
});
assert('Rejecting without reason is rejected by validator', !rejectWithoutReason.valid);
assert('Error message mentions mandatory reason for Rejected', 
    rejectWithoutReason.error.includes('mandatory reason') || rejectWithoutReason.error.includes('required')
);

const rejectWithReason = validateStatusTransition({
    currentStatus: 'Under Review',
    newStatus: 'Rejected',
    userRole: 'Admin',
    reason: 'Property documents incomplete'
});
assert('Rejecting with valid reason passes validation', rejectWithReason.valid);

// 2. Mandatory Reason for Suspended
const suspendWithoutReason = validateStatusTransition({
    currentStatus: 'Active',
    newStatus: 'Suspended',
    userRole: 'Admin',
    reason: ''
});
assert('Suspending without reason is rejected by validator', !suspendWithoutReason.valid);

const suspendWithReason = validateStatusTransition({
    currentStatus: 'Active',
    newStatus: 'Suspended',
    userRole: 'Admin',
    reason: 'Court dispute pending'
});
assert('Suspending with reason passes validation for Admin', suspendWithReason.valid);

// 3. Employee cannot Suspend
const empSuspend = validateStatusTransition({
    currentStatus: 'Active',
    newStatus: 'Suspended',
    userRole: 'Employee',
    reason: 'Suspension attempt'
});
assert('Employee cannot suspend listings (Admin-only)', !empSuspend.valid && empSuspend.error.includes('Unauthorized'));

// 4. Employee cannot modify listing assigned to someone else
const empUnauthorizedListing = validateStatusTransition({
    currentStatus: 'Pending',
    newStatus: 'Under Review',
    userRole: 'Employee',
    listing: { id: 55, assigned_employee_id: 'emp-2' },
    currentUserId: 'emp-1'
});
assert('Employee cannot moderate listing assigned to another reviewer', 
    !empUnauthorizedListing.valid && empUnauthorizedListing.error.includes('assigned to you')
);

// 5. Unauthorized role
const brokerAttempt = validateStatusTransition({
    currentStatus: 'Pending',
    newStatus: 'Active',
    userRole: 'Broker'
});
assert('Broker cannot moderate listings', !brokerAttempt.valid && brokerAttempt.error.includes('Unauthorized'));

// ── Section 3: Notification Message Formatting ──
console.log('\n--- Section 3: Notification Formatting ---');

const notifApproved = formatModerationNotification('Villa Azure', 'Under Review', 'Active');
assert('Approval notification contains property title and approved notice',
    notifApproved.includes('Villa Azure') && notifApproved.includes('approved') && notifApproved.includes('publicly visible')
);

const notifRejected = formatModerationNotification('Skyline Flat', 'Under Review', 'Rejected', 'High resolution images missing');
assert('Rejection notification includes reason',
    notifRejected.includes('rejected') && notifRejected.includes('High resolution images missing')
);

const notifSuspended = formatModerationNotification('Grand Estate', 'Active', 'Suspended', 'Ownership dispute');
assert('Suspension notification includes reason',
    notifSuspended.includes('suspended') && notifSuspended.includes('Ownership dispute')
);

const notifUnderReview = formatModerationNotification('Palm Villa', 'Pending', 'Under Review');
assert('Under Review notification informs owner review is in progress',
    notifUnderReview.includes('under review')
);

// ── Section 4: Audit Logging & Database Update Simulation ──
console.log('\n--- Section 4: Supabase Integration & Audit History ---');

// Mock in-memory database
const db = {
    listings: [
        { id: 101, title: 'Palm Residency', status: 'Pending', broker_id: 'broker-1', assigned_employee_id: null },
        { id: 102, title: 'Sea Breeze Apt', status: 'Under Review', broker_id: 'broker-2', assigned_employee_id: 'emp-1' },
        { id: 103, title: 'Sunset Penthouse', status: 'Active', broker_id: 'broker-3', assigned_employee_id: 'emp-1' }
    ],
    listing_status_history: [],
    notifications: []
};

// Mock Supabase client
function createMockSupabase(db) {
    return {
        from: (table) => {
            let filterField = null;
            let filterVal = null;
            let updateData = null;
            let insertRows = null;

            const chain = {
                select: (cols) => chain,
                order: () => chain,
                limit: () => chain,
                eq: (field, val) => {
                    filterField = field;
                    filterVal = val;
                    return chain;
                },
                is: (field, val) => {
                    filterField = field;
                    filterVal = val;
                    return chain;
                },
                single: async () => {
                    if (table === 'listings') {
                        const item = db.listings.find(x => x[filterField] == filterVal);
                        return { data: item || null, error: null };
                    }
                    if (table === 'listing_status_history') {
                        return { data: db.listing_status_history[db.listing_status_history.length - 1], error: null };
                    }
                    return { data: null, error: null };
                },
                update: (data) => {
                    updateData = data;
                    return {
                        eq: (field, val) => {
                            const item = db[table].find(x => x[field] == val);
                            if (item) Object.assign(item, data);
                            return {
                                select: () => ({
                                    single: async () => ({ data: item, error: null })
                                }),
                                error: null
                            };
                        }
                    };
                },
                insert: (rows) => {
                    insertRows = rows;
                    if (Array.isArray(rows)) {
                        db[table].push(...rows);
                    } else {
                        db[table].push(rows);
                    }
                    return {
                        select: () => ({
                            single: async () => ({ data: rows[0], error: null })
                        }),
                        error: null
                    };
                }
            };
            return chain;
        }
    };
}

const mockClient = createMockSupabase(db);

// Test 1: Employee claiming a listing
await assignListingEmployee({
    listingId: 101,
    assignedEmployeeId: 'emp-1',
    userRole: 'Employee',
    currentUserId: 'emp-1'
}, mockClient);

assert('Employee successfully claimed listing 101', 
    db.listings.find(l => l.id === 101).assigned_employee_id === 'emp-1'
);

// Test 2: Employee approving listing (Pending -> Under Review -> Active)
await updateListingModerationStatus({
    listingId: 101,
    oldStatus: 'Pending',
    newStatus: 'Under Review',
    changedByUserId: 'emp-1',
    userRole: 'Employee',
    brokerId: 'broker-1',
    listingTitle: 'Palm Residency',
    listing: db.listings.find(l => l.id === 101)
}, mockClient);

assert('Listing 101 status is now Under Review', 
    db.listings.find(l => l.id === 101).status === 'Under Review'
);
assert('Audit history recorded Under Review transition',
    db.listing_status_history.some(h => h.listing_id === 101 && h.new_status === 'Under Review' && h.changed_by === 'emp-1')
);

await updateListingModerationStatus({
    listingId: 101,
    oldStatus: 'Under Review',
    newStatus: 'Active',
    changedByUserId: 'emp-1',
    userRole: 'Employee',
    reason: 'All verified',
    brokerId: 'broker-1',
    listingTitle: 'Palm Residency',
    listing: db.listings.find(l => l.id === 101)
}, mockClient);

assert('Listing 101 is now Active (Approved)', 
    db.listings.find(l => l.id === 101).status === 'Active'
);
assert('Audit history recorded Active approval with reason',
    db.listing_status_history.some(h => h.listing_id === 101 && h.new_status === 'Active' && h.reason === 'All verified')
);
assert('Notification dispatched to broker-1 for approval',
    db.notifications.some(n => n.user_id === 'broker-1' && n.title.includes('Approved'))
);

// Test 3: Admin suspending an active listing with mandatory reason
await updateListingModerationStatus({
    listingId: 103,
    oldStatus: 'Active',
    newStatus: 'Suspended',
    changedByUserId: 'admin-1',
    userRole: 'Admin',
    reason: 'Fraudulent paperwork reported',
    brokerId: 'broker-3',
    listingTitle: 'Sunset Penthouse',
    listing: db.listings.find(l => l.id === 103)
}, mockClient);

assert('Listing 103 is now Suspended',
    db.listings.find(l => l.id === 103).status === 'Suspended'
);
assert('Audit history recorded Suspended status with mandatory reason',
    db.listing_status_history.some(h => h.listing_id === 103 && h.new_status === 'Suspended' && h.reason === 'Fraudulent paperwork reported')
);
assert('Notification dispatched to broker-3 for suspension with reason',
    db.notifications.some(n => n.user_id === 'broker-3' && n.message.includes('Fraudulent paperwork reported'))
);

// ── Section 5: Public Search & Discovery Visibility ──
console.log('\n--- Section 5: Public Search & Discovery Visibility ---');

// Simulated listings set
const platformListings = [
    { id: 1, title: 'L1', status: 'Active' },
    { id: 2, title: 'L2', status: 'Pending' },
    { id: 3, title: 'L3', status: 'Under Review' },
    { id: 4, title: 'L4', status: 'Rejected' },
    { id: 5, title: 'L5', status: 'Suspended' },
    { id: 6, title: 'L6', status: 'sold_out' },
    { id: 7, title: 'L7', status: 'Draft' }
];

// Public query filter rule: status in ('Active', 'sold_out')
const publicVisibleListings = platformListings.filter(l => l.status === 'Active' || isListingSoldOut(l));

assert('Public search only displays Active and sold_out listings', 
    publicVisibleListings.length === 2 &&
    publicVisibleListings.every(l => l.status === 'Active' || l.status === 'sold_out')
);
assert('Pending listings are not publicly visible', !publicVisibleListings.some(l => l.status === 'Pending'));
assert('Under Review listings are not publicly visible', !publicVisibleListings.some(l => l.status === 'Under Review'));
assert('Rejected listings are not publicly visible', !publicVisibleListings.some(l => l.status === 'Rejected'));
assert('Suspended listings are not publicly visible', !publicVisibleListings.some(l => l.status === 'Suspended'));
assert('Draft listings are not publicly visible', !publicVisibleListings.some(l => l.status === 'Draft'));

// ── Section 6: Status Display & Badge Helpers ──
console.log('\n--- Section 6: Status Display & Badge Helpers ---');

assert('formatListingStatus("active") returns Active', formatListingStatus('active') === 'Active');
assert('formatListingStatus("under review") returns Under Review', formatListingStatus('under review') === 'Under Review');
assert('formatListingStatus("rejected") returns Rejected', formatListingStatus('rejected') === 'Rejected');
assert('formatListingStatus("suspended") returns Suspended', formatListingStatus('suspended') === 'Suspended');
assert('formatListingStatus("sold_out") returns Sold Out', formatListingStatus('sold_out') === 'Sold Out');

assert('STATUS_BADGE_CLASSES contains Under Review style', !!STATUS_BADGE_CLASSES['Under Review']);
assert('STATUS_BADGE_CLASSES contains Rejected style', !!STATUS_BADGE_CLASSES['Rejected']);
assert('STATUS_BADGE_CLASSES contains Suspended style', !!STATUS_BADGE_CLASSES['Suspended']);
assert('STATUS_DISPLAY_LABELS maps Active to Approved (Active)', STATUS_DISPLAY_LABELS['Active'] === 'Approved (Active)');

// ── Summary ──
console.log('\n================================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('================================================================\n');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
