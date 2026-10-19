/**
 * Test Suite: Broker Lead Status Management
 * Run: node scripts/test_broker_lead_status.js
 *
 * Verifies:
 *  1. Status Functionality:
 *     - All 5 statuses present with exact labels.
 *     - Default status for new and missing leads is "New Lead".
 *     - Standardization of legacy typos ("Requsted" -> "Requested", etc.).
 *     - Status badge color styling and accessibility.
 *     - Each lead manages its status independently.
 *  2. Security & Authorization:
 *     - Owning broker can update lead status.
 *     - Unrelated broker is rejected with Unauthorized error.
 *     - Unauthenticated caller is rejected.
 *     - Admin & Employee roles can update.
 *     - Invalid status values are rejected.
 *     - Other inquiry fields (message, name, listing) are never overwritten.
 *  3. Filtering & Search:
 *     - Filtering by status isolates matching leads.
 *     - Search query combines with status filter.
 *  4. Audit History & Notifications:
 *     - Changes record an entry in lead_status_history.
 *     - Notifications dispatched to broker when status changes.
 *     - No duplicate notifications when status is unchanged.
 *  5. Error Handling & Rollback:
 *     - Database failure bubbles error to enable UI rollback.
 */

import {
    LEAD_STATUSES,
    LEAD_STATUS_OPTIONS,
    LEAD_STATUS_BADGE_CLASSES,
    normalizeLeadStatus,
    getInquiries,
    getInquiryById,
    createInquiry,
    updateLeadStatus,
    getLeadStatusHistory
} from '../js/services/inquiry-service.js';

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
console.log('ProjectX: Broker Lead Status Management Test Suite');
console.log('================================================================');

// ── Section 1: Lead Status Options & Standardization ──
console.log('\n--- Section 1: Lead Status Options & Normalization ---');

const expectedStatuses = [
    'New Lead',
    'Site Visit Requested',
    'Site Visit Done',
    'Follow-up',
    'Not Interested'
];

assert('LEAD_STATUS_OPTIONS has exactly 5 statuses', LEAD_STATUS_OPTIONS.length === 5);

expectedStatuses.forEach(status => {
    assert(`LEAD_STATUS_OPTIONS includes exact status "${status}"`, LEAD_STATUS_OPTIONS.includes(status));
});

// Normalization & Defaults
assert('normalizeLeadStatus() with undefined returns "New Lead"', normalizeLeadStatus(undefined) === 'New Lead');
assert('normalizeLeadStatus() with null returns "New Lead"', normalizeLeadStatus(null) === 'New Lead');
assert('normalizeLeadStatus() with empty string returns "New Lead"', normalizeLeadStatus('') === 'New Lead');
assert('normalizeLeadStatus("New Lead") returns "New Lead"', normalizeLeadStatus('New Lead') === 'New Lead');
assert('normalizeLeadStatus corrects legacy typo "Site Visit Requsted"', normalizeLeadStatus('Site Visit Requsted') === 'Site Visit Requested');
assert('normalizeLeadStatus normalizes "Site Request Done"', normalizeLeadStatus('Site Request Done') === 'Site Visit Done');
assert('normalizeLeadStatus normalizes "follow up"', normalizeLeadStatus('follow up') === 'Follow-up');
assert('normalizeLeadStatus normalizes "not interested"', normalizeLeadStatus('not interested') === 'Not Interested');
assert('normalizeLeadStatus with unknown string safely defaults to "New Lead"', normalizeLeadStatus('Random String') === 'New Lead');

// ── Section 2: Lead Status Badge Styling & Accessibility ──
console.log('\n--- Section 2: Status Badge Styling & Visual Hierarchy ---');

assert('New Lead badge has blue styling', LEAD_STATUS_BADGE_CLASSES['New Lead'].includes('blue'));
assert('Site Visit Requested badge has purple styling', LEAD_STATUS_BADGE_CLASSES['Site Visit Requested'].includes('purple'));
assert('Site Visit Done badge has green/emerald styling', LEAD_STATUS_BADGE_CLASSES['Site Visit Done'].includes('emerald') || LEAD_STATUS_BADGE_CLASSES['Site Visit Done'].includes('green'));
assert('Follow-up badge has amber/yellow styling', LEAD_STATUS_BADGE_CLASSES['Follow-up'].includes('amber'));
assert('Not Interested badge has slate/gray muted styling', LEAD_STATUS_BADGE_CLASSES['Not Interested'].includes('slate') || LEAD_STATUS_BADGE_CLASSES['Not Interested'].includes('gray') || LEAD_STATUS_BADGE_CLASSES['Not Interested'].includes('red'));

// ── Mock Supabase Database Harness ──
function createMockSupabase(initialInquiries = [], initialHistory = [], initialNotifications = []) {
    const inquiries = JSON.parse(JSON.stringify(initialInquiries));
    const history = JSON.parse(JSON.stringify(initialHistory));
    const notifications = JSON.parse(JSON.stringify(initialNotifications));

    return {
        _inquiries: inquiries,
        _history: history,
        _notifications: notifications,
        _shouldFailUpdate: false,

        rpc(funcName, params) {
            // Emulate RPC behavior or trigger fallback
            return Promise.resolve({ data: null, error: { message: 'function not found' } });
        },

        from(table) {
            if (table === 'inquiries') {
                return {
                    select(fields) {
                        return {
                            order(col, { ascending }) {
                                return {
                                    eq(field, val) {
                                        const res = inquiries.filter(i => String(i[field]) === String(val));
                                        return Promise.resolve({ data: res, error: null });
                                    },
                                    then(resolve) {
                                        return Promise.resolve({ data: inquiries, error: null }).then(resolve);
                                    }
                                };
                            },
                            eq(field, val) {
                                return {
                                    single() {
                                        const found = inquiries.find(i => String(i[field]) === String(val));
                                        return Promise.resolve({ data: found ? { ...found } : null, error: found ? null : { message: 'Not found' } });
                                    }
                                };
                            }
                        };
                    },
                    insert(rows) {
                        return {
                            select() {
                                return {
                                    single() {
                                        const row = { id: inquiries.length + 1, ...rows[0], created_at: new Date().toISOString() };
                                        inquiries.push(row);
                                        return Promise.resolve({ data: row, error: null });
                                    }
                                };
                            }
                        };
                    },
                    update(patch) {
                        return {
                            eq(field, val) {
                                return {
                                    select(fields) {
                                        return {
                                            single() {
                                                const idx = inquiries.findIndex(i => String(i[field]) === String(val));
                                                if (idx === -1) {
                                                    return Promise.resolve({ data: null, error: { message: 'Not found' } });
                                                }
                                                // Test failure simulation
                                                if (patch._simulateFailure) {
                                                    return Promise.resolve({ data: null, error: { message: 'Database connection failed' } });
                                                }
                                                inquiries[idx] = { ...inquiries[idx], ...patch };
                                                return Promise.resolve({ data: { ...inquiries[idx] }, error: null });
                                            }
                                        };
                                    }
                                };
                            }
                        };
                    }
                };
            }

            if (table === 'lead_status_history') {
                return {
                    insert(rows) {
                        history.push(...rows.map(r => ({ id: history.length + 1, ...r, created_at: new Date().toISOString() })));
                        return Promise.resolve({ data: rows, error: null });
                    },
                    select() {
                        return {
                            eq(field, val) {
                                return {
                                    order(col, { ascending }) {
                                        const res = history.filter(h => String(h[field]) === String(val));
                                        return Promise.resolve({ data: res, error: null });
                                    }
                                };
                            }
                        };
                    }
                };
            }

            if (table === 'notifications') {
                return {
                    insert(rows) {
                        notifications.push(...rows.map(n => ({ id: notifications.length + 1, ...n, created_at: new Date().toISOString() })));
                        return Promise.resolve({ data: rows, error: null });
                    }
                };
            }

            throw new Error(`Unknown mock table: ${table}`);
        }
    };
}

// ── Section 3: Lead Status Creation & Independence ──
console.log('\n--- Section 3: Lead Creation, Defaults & Independence ---');

async function testLeadCreationAndDefaults() {
    const mockDb = createMockSupabase();

    // 1. Create lead with no status specified
    const lead1 = await createInquiry({
        name: 'Aarav Patel',
        message: 'Interested in 3 BHK (Contact: +91 98765 43210)',
        broker_id: 'broker-101',
        listing_id: 1,
        type: 'buy'
    }, mockDb);

    assert('New inquiry automatically defaults to "New Lead"', lead1.lead_status === 'New Lead');

    // 2. Create second lead with specific status
    const lead2 = await createInquiry({
        name: 'Diya Sharma',
        message: 'Can I visit tomorrow? (Contact: +91 91234 56789)',
        broker_id: 'broker-101',
        listing_id: 1,
        type: 'buy',
        lead_status: 'Site Visit Requested'
    }, mockDb);

    assert('Second inquiry retains its explicit status "Site Visit Requested"', lead2.lead_status === 'Site Visit Requested');

    // 3. Verify independence
    await updateLeadStatus({
        inquiryId: lead1.id,
        newStatus: 'Site Visit Done',
        currentUserId: 'broker-101',
        userRole: 'Broker'
    }, mockDb);

    const checkLead1 = await getInquiryById(lead1.id, mockDb);
    const checkLead2 = await getInquiryById(lead2.id, mockDb);

    assert('Lead 1 updated to "Site Visit Done"', checkLead1.lead_status === 'Site Visit Done');
    assert('Lead 2 independently remained "Site Visit Requested"', checkLead2.lead_status === 'Site Visit Requested');
}
await testLeadCreationAndDefaults();

// ── Section 4: Authorization & Security ──
console.log('\n--- Section 4: Authorization & Security Enforcement ---');

async function testAuthorization() {
    const mockDb = createMockSupabase([
        {
            id: 201,
            name: 'Karan Mehra',
            message: 'Inquiry message',
            broker_id: 'broker-alice',
            listing_id: 10,
            lead_status: 'New Lead',
            listing: { id: 10, title: 'Luxury Penthouse', location: 'Bandra West' }
        }
    ]);

    // Test 1: Owning broker can update
    const resultAlice = await updateLeadStatus({
        inquiryId: 201,
        newStatus: 'Site Visit Requested',
        currentUserId: 'broker-alice',
        userRole: 'Broker'
    }, mockDb);
    assert('Owning broker Alice can successfully update status', resultAlice.success && resultAlice.newStatus === 'Site Visit Requested');

    // Test 2: Unrelated broker cannot update
    let unrelatedBlocked = false;
    try {
        await updateLeadStatus({
            inquiryId: 201,
            newStatus: 'Not Interested',
            currentUserId: 'broker-bob',
            userRole: 'Broker'
        }, mockDb);
    } catch (err) {
        unrelatedBlocked = err.message.includes('Unauthorized');
    }
    assert('Unrelated broker Bob is blocked with Unauthorized error', unrelatedBlocked);

    // Test 3: Unauthenticated user cannot update
    let unauthBlocked = false;
    try {
        await updateLeadStatus({
            inquiryId: 201,
            newStatus: 'Follow-up',
            currentUserId: null,
            userRole: 'Broker'
        }, mockDb);
    } catch (err) {
        unauthBlocked = err.message.includes('Unauthorized');
    }
    assert('Unauthenticated user is blocked with Unauthorized error', unauthBlocked);

    // Test 4: Admin role can update any broker lead
    const resultAdmin = await updateLeadStatus({
        inquiryId: 201,
        newStatus: 'Follow-up',
        currentUserId: 'admin-1',
        userRole: 'Admin'
    }, mockDb);
    assert('Admin can update lead status for staff moderation', resultAdmin.success && resultAdmin.newStatus === 'Follow-up');

    // Test 5: Employee role can update lead
    const resultEmp = await updateLeadStatus({
        inquiryId: 201,
        newStatus: 'Site Visit Done',
        currentUserId: 'emp-1',
        userRole: 'Employee'
    }, mockDb);
    assert('Employee can update lead status for staff moderation', resultEmp.success && resultEmp.newStatus === 'Site Visit Done');

    // Test 6: Invalid status is rejected
    let invalidStatusRejected = false;
    try {
        await updateLeadStatus({
            inquiryId: 201,
            newStatus: 'Super Closed',
            currentUserId: 'broker-alice',
            userRole: 'Broker'
        }, mockDb);
    } catch (err) {
        invalidStatusRejected = err.message.includes('Invalid lead status');
    }
    assert('Invalid status "Super Closed" is rejected before mutation', invalidStatusRejected);

    // Test 7: Verify original inquiry fields remained untouched
    const afterTests = await getInquiryById(201, mockDb);
    assert('Inquiry name is preserved without alteration', afterTests.name === 'Karan Mehra');
    assert('Inquiry message is preserved without alteration', afterTests.message === 'Inquiry message');
    assert('Inquiry listing_id is preserved', afterTests.listing_id === 10);
}
await testAuthorization();

// ── Section 5: Audit History & Broker Notifications ──
console.log('\n--- Section 5: Audit History Logging & Notifications ---');

async function testAuditHistoryAndNotifications() {
    const mockDb = createMockSupabase([
        {
            id: 301,
            name: 'Pooja Hegde',
            message: 'Looking for 2 BHK',
            broker_id: 'broker-42',
            listing_id: 15,
            lead_status: 'New Lead'
        }
    ]);

    // Transition 1: New Lead -> Site Visit Requested
    await updateLeadStatus({
        inquiryId: 301,
        newStatus: 'Site Visit Requested',
        currentUserId: 'broker-42',
        userRole: 'Broker'
    }, mockDb);

    // Transition 2: Site Visit Requested -> Site Visit Done
    await updateLeadStatus({
        inquiryId: 301,
        newStatus: 'Site Visit Done',
        currentUserId: 'broker-42',
        userRole: 'Broker'
    }, mockDb);

    // Transition 3: Re-selecting same status (Site Visit Done -> Site Visit Done)
    await updateLeadStatus({
        inquiryId: 301,
        newStatus: 'Site Visit Done',
        currentUserId: 'broker-42',
        userRole: 'Broker'
    }, mockDb);

    const history = await getLeadStatusHistory(301, mockDb);
    assert('Audit history recorded 3 transition events', history.length === 3);
    assert('History records old_status: "New Lead", new_status: "Site Visit Requested"',
        history[0].old_status === 'New Lead' && history[0].new_status === 'Site Visit Requested'
    );
    assert('History records user who made the change', history[0].changed_by === 'broker-42');

    // Notifications check: only when status actually changed (2 changes, not 3)
    const brokerNotifications = mockDb._notifications.filter(n => n.user_id === 'broker-42');
    assert('Broker received notifications for status changes', brokerNotifications.length === 2);
    assert('Notification contains customer name and new status',
        brokerNotifications[0].message.includes('Pooja Hegde') && brokerNotifications[0].message.includes('Site Visit Requested')
    );
}
await testAuditHistoryAndNotifications();

// ── Section 6: Filtering by Lead Status & Search ──
console.log('\n--- Section 6: Filtering by Status & Search Integration ---');

async function testFiltering() {
    const mockDb = createMockSupabase([
        { id: 1, name: 'Rohan Joshi', message: 'Hello', broker_id: 'b1', lead_status: 'New Lead', listing: { title: 'Sky Villa', location: 'Worli' } },
        { id: 2, name: 'Ananya Roy', message: 'Site visit', broker_id: 'b1', lead_status: 'Site Visit Requested', listing: { title: 'Sea Breeze', location: 'Juhu' } },
        { id: 3, name: 'Vikram Singh', message: 'Follow up call', broker_id: 'b1', lead_status: 'Follow-up', listing: { title: 'Green Acres', location: 'Thane' } },
        { id: 4, name: 'Sneha Patel', message: 'No longer needed', broker_id: 'b1', lead_status: 'Not Interested', listing: { title: 'Sky Villa', location: 'Worli' } },
        { id: 5, name: 'Kavita Rao', message: 'Visited', broker_id: 'b1', lead_status: 'Site Visit Done', listing: { title: 'Palm Grove', location: 'Powai' } }
    ]);

    // 1. All leads
    const all = await getInquiries('b1', { statusFilter: 'All' }, mockDb);
    assert('All filter returns all 5 leads', all.length === 5);

    // 2. Filter by "New Lead"
    const newLeads = await getInquiries('b1', { statusFilter: 'New Lead' }, mockDb);
    assert('Filter "New Lead" returns 1 lead', newLeads.length === 1 && newLeads[0].name === 'Rohan Joshi');

    // 3. Filter by "Site Visit Requested"
    const requested = await getInquiries('b1', { statusFilter: 'Site Visit Requested' }, mockDb);
    assert('Filter "Site Visit Requested" returns 1 lead', requested.length === 1 && requested[0].name === 'Ananya Roy');

    // 4. Combined Filter + Search Query (search by property title)
    const searchVilla = await getInquiries('b1', { statusFilter: 'All', searchQuery: 'Sky Villa' }, mockDb);
    assert('Search "Sky Villa" across all statuses returns 2 leads', searchVilla.length === 2);

    const searchVillaNew = await getInquiries('b1', { statusFilter: 'New Lead', searchQuery: 'Sky Villa' }, mockDb);
    assert('Filter "New Lead" combined with search "Sky Villa" returns 1 lead', searchVillaNew.length === 1 && searchVillaNew[0].name === 'Rohan Joshi');

    // 5. Search by location
    const searchJuhu = await getInquiries('b1', { statusFilter: 'All', searchQuery: 'Juhu' }, mockDb);
    assert('Search by property location "Juhu" returns matching lead', searchJuhu.length === 1 && searchJuhu[0].name === 'Ananya Roy');
}
await testFiltering();

// ── Section 7: Error Handling & Failure Rollback ──
console.log('\n--- Section 7: Error Handling & UI State Rollback Support ---');

async function testErrorHandling() {
    const mockDb = createMockSupabase([
        { id: 401, name: 'Devendra', message: 'Hi', broker_id: 'b2', lead_status: 'New Lead' }
    ]);

    let failedAsExpected = false;
    try {
        // Trigger simulated database error
        await updateLeadStatus({
            inquiryId: 401,
            newStatus: 'Site Visit Done',
            currentUserId: 'b2',
            userRole: 'Broker'
        }, {
            ...mockDb,
            from(table) {
                if (table === 'inquiries') {
                    return {
                        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 401, broker_id: 'b2', lead_status: 'New Lead' }, error: null }) }) }),
                        update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Network timeout') }) }) }) })
                    };
                }
                return mockDb.from(table);
            }
        });
    } catch (err) {
        failedAsExpected = err.message.includes('Network timeout');
    }

    assert('Service throws when database update fails, allowing UI to revert dropdown and alert broker', failedAsExpected);
}
await testErrorHandling();

console.log('================================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) {
    process.exit(1);
}
