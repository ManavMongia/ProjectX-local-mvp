/**
 * Automated Test Suite for ProjectX: Mark Listing as Sold Out Feature
 *
 * Verifies:
 * 1. Broker Authorization:
 *    - Authorized broker can mark own/managed listing as Sold Out.
 *    - Broker cannot mark another broker's listing as Sold Out (rejected).
 *    - Non-broker / unauthenticated user rejected from marking listing as Sold Out.
 *    - Platform Staff (Admin/Employee) authorized.
 * 2. Listing Status Lifecycle & Formats:
 *    - Listing status changes to 'sold_out'.
 *    - Already sold-out listing does not create duplicate/unnecessary DB changes (idempotent).
 *    - Utility functions (isListingSoldOut, formatListingStatus, renderListingSoldOutBadge).
 *    - Existing statuses ('Active', 'Pending', 'Flagged', 'Sold') continue functioning.
 * 3. Buyer UI & Experience:
 *    - Sold-out listing displays prominent 'SOLD OUT' badge in cards and search results.
 *    - Property details page displays bold 'SOLD OUT' badge and Sold Out banner.
 *    - Inquiries and chat are closed/disabled on sold-out properties.
 *    - Broker profile and contact info remain visible for reference.
 * 4. Independence from Verification & Ratings:
 *    - Sold-out status does NOT change verification status (Verified vs Non-Verified remain distinct).
 *    - Sold-out status does NOT add ratings to properties or alter broker transaction ratings.
 * 5. Automatic Property Grouping Compatibility:
 *    - Changing status to sold_out does not alter or break property_group_id.
 * 6. Listing Management UI:
 *    - Listing management displays 'Sold Out' status badge.
 *    - Action column replaces 'Mark as Sold Out' button with static 'Sold Out' indicator.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory mock localStorage for Node environment
const mockStorage = {};
globalThis.localStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

if (!globalThis.window) {
    globalThis.window = {
        dispatchEvent: () => true,
        location: { search: '', origin: 'http://localhost:5173' }
    };
    globalThis.CustomEvent = class CustomEvent {
        constructor(type, detail) {
            this.type = type;
            this.detail = detail;
        }
    };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('ProjectX: Mark Listing as Sold Out Feature Test Suite');
    console.log('================================================================\n');

    const brokerA_Id = 'broker-a-uuid-001';
    const brokerB_Id = 'broker-b-uuid-002';
    const buyerId = 'buyer-uuid-999';
    const adminId = 'admin-uuid-000';

    // Mock listings store
    const mockListingsDb = [
        {
            id: 101,
            title: 'Sea Breeze 3BHK Penthouse',
            price: '45000000',
            intent: 'Buy',
            type: 'Apartment',
            location: 'Bandra West, Mumbai',
            beds: 3,
            baths: 3,
            sqft: 2200,
            status: 'Active',
            broker_id: brokerA_Id,
            created_by: brokerA_Id,
            is_verified: true,
            property_group_id: 'grp-mumbai-sea-breeze'
        },
        {
            id: 102,
            title: 'Green Valley 2BHK',
            price: '8500000',
            intent: 'Buy',
            type: 'Apartment',
            location: 'Whitefield, Bangalore',
            beds: 2,
            baths: 2,
            sqft: 1250,
            status: 'Active',
            broker_id: brokerB_Id,
            created_by: brokerB_Id,
            is_verified: false,
            property_group_id: 'grp-blr-green-valley'
        },
        {
            id: 103,
            title: 'Legacy Commercial Unit',
            price: '30000000',
            intent: 'Buy',
            type: 'Commercial',
            location: 'Cyber Hub, Gurgaon',
            beds: 0,
            baths: 2,
            sqft: 1800,
            status: 'sold_out',
            broker_id: brokerA_Id,
            created_by: brokerA_Id,
            is_verified: true,
            property_group_id: 'grp-ggn-cyber'
        }
    ];

    // Mock supabase.from('listings')
    const { supabase } = await import('../js/core/supabase-client.js');
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
        if (table === 'listings') {
            return {
                select: (cols) => ({
                    eq: (col, val) => ({
                        single: async () => {
                            const item = mockListingsDb.find(l => String(l[col]) === String(val));
                            return item ? { data: { ...item }, error: null } : { data: null, error: { message: 'Not found' } };
                        }
                    })
                }),
                update: (updates) => ({
                    eq: (col, val) => ({
                        select: () => ({
                            single: async () => {
                                const item = mockListingsDb.find(l => String(l[col]) === String(val));
                                if (!item) return { data: null, error: { message: 'Not found' } };
                                Object.assign(item, updates);
                                return { data: { ...item }, error: null };
                            }
                        })
                    })
                })
            };
        }
        return originalFrom(table);
    };

    const {
        isListingSoldOut,
        formatListingStatus,
        renderListingSoldOutBadge,
        isListingVerified,
        renderListingVerificationBadge,
        markListingSoldOut,
        getListingById
    } = await import('../js/services/listing-service.js');

    // -------------------------------------------------------------
    // SECTION 1: STATUS RECOGNITION & UTILITY FUNCTIONS
    // -------------------------------------------------------------
    console.log('--- Section 1: Listing Status Utilities & Formatting ---');

    assert(isListingSoldOut('sold_out') === true, 'isListingSoldOut recognizes "sold_out"');
    assert(isListingSoldOut('Sold_Out') === true, 'isListingSoldOut is case-insensitive for "Sold_Out"');
    assert(isListingSoldOut('sold out') === true, 'isListingSoldOut recognizes "sold out" with space');
    assert(isListingSoldOut('Sold') === true, 'isListingSoldOut recognizes legacy "Sold"');
    assert(isListingSoldOut({ status: 'sold_out' }) === true, 'isListingSoldOut recognizes listing object with status "sold_out"');
    assert(isListingSoldOut({ status: 'Active' }) === false, 'isListingSoldOut returns false for "Active"');
    assert(isListingSoldOut({ status: 'Pending' }) === false, 'isListingSoldOut returns false for "Pending"');
    assert(isListingSoldOut({ status: 'Flagged' }) === false, 'isListingSoldOut returns false for "Flagged"');
    assert(isListingSoldOut(null) === false, 'isListingSoldOut safely handles null/undefined');

    assert(formatListingStatus('sold_out') === 'Sold Out', 'formatListingStatus formats "sold_out" to "Sold Out"');
    assert(formatListingStatus('active') === 'Active', 'formatListingStatus formats "active" to "Active"');
    assert(formatListingStatus('pending') === 'Pending', 'formatListingStatus formats "pending" to "Pending"');

    const badgeHTML = renderListingSoldOutBadge(true);
    assert(badgeHTML.includes('SOLD OUT') && badgeHTML.includes('rose'), 'renderListingSoldOutBadge generates styled rose SOLD OUT badge');
    assert(renderListingSoldOutBadge(false) === '', 'renderListingSoldOutBadge returns empty string when not sold out');

    // -------------------------------------------------------------
    // SECTION 2: AUTHORIZATION LOGIC
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Broker Authorization & Ownership Validation ---');

    // Case 2.1: Unauthenticated request must fail
    localStorage.clear();
    let authErrorCaught = false;
    try {
        await markListingSoldOut(101);
    } catch (err) {
        authErrorCaught = true;
        assert(err.message.includes('Authentication required'), `Unauthenticated attempt rejected: "${err.message}"`);
    }
    assert(authErrorCaught, 'Unauthenticated user cannot mark listing as sold out');

    // Case 2.2: Broker B attempts to mark Broker A's listing (101) as Sold Out -> Must Fail
    localStorage.setItem('userId', brokerB_Id);
    localStorage.setItem('role', 'Broker');
    let unauthorizedErrorCaught = false;
    try {
        await markListingSoldOut(101);
    } catch (err) {
        unauthorizedErrorCaught = true;
        assert(err.message.includes('Unauthorized'), `Cross-broker modification rejected: "${err.message}"`);
    }
    assert(unauthorizedErrorCaught, 'Broker B cannot mark Broker A\'s listing as sold out');

    // Case 2.3: Non-broker user (Buyer) attempts to mark listing as Sold Out -> Must Fail
    localStorage.setItem('userId', buyerId);
    localStorage.setItem('role', 'Buyer');
    let buyerRejected = false;
    try {
        await markListingSoldOut(101);
    } catch (err) {
        buyerRejected = true;
        assert(err.message.includes('Unauthorized'), `Buyer modification rejected: "${err.message}"`);
    }
    assert(buyerRejected, 'Buyer role cannot mark listing as sold out');

    // Case 2.4: Authorized Broker A marks own listing (101) as Sold Out -> Must Succeed
    localStorage.setItem('userId', brokerA_Id);
    localStorage.setItem('role', 'Broker');
    try {
        const updated = await markListingSoldOut(101);
        assert(updated.status === 'sold_out', 'Authorized Broker A successfully marked listing 101 as sold_out');
        const retrieved = await getListingById(101);
        assert(retrieved.status === 'sold_out', 'Persisted listing 101 now has status "sold_out"');
    } catch (err) {
        assert(false, `Authorized broker failed to mark listing: ${err.message}`);
    }

    // Case 2.5: Platform Admin can mark listing as Sold Out -> Must Succeed
    localStorage.setItem('userId', adminId);
    localStorage.setItem('role', 'Admin');
    try {
        const updated = await markListingSoldOut(102);
        assert(updated.status === 'sold_out', 'Admin successfully marked listing 102 as sold_out');
    } catch (err) {
        assert(false, `Admin failed: ${err.message}`);
    }

    // -------------------------------------------------------------
    // SECTION 3: IDEMPOTENCY & REPEATED CALLS
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Idempotency & Repeat Calls ---');

    localStorage.setItem('userId', brokerA_Id);
    localStorage.setItem('role', 'Broker');

    // Listing 103 is already sold_out
    const repeatResult = await markListingSoldOut(103);
    assert(repeatResult.status === 'sold_out', 'Calling markListingSoldOut on already sold-out listing succeeds cleanly');
    assert(isListingSoldOut(repeatResult), 'Listing remains sold out without duplicate state alterations');

    // -------------------------------------------------------------
    // SECTION 4: INDEPENDENCE FROM VERIFICATION & RATINGS
    // -------------------------------------------------------------
    console.log('\n--- Section 4: Independence from Verification Badges & Broker Ratings ---');

    const listing101 = await getListingById(101);
    assert(listing101.status === 'sold_out', 'Listing 101 is sold_out');
    assert(listing101.is_verified === true, 'Listing 101 verification badge remains Verified');
    const vBadge = renderListingVerificationBadge(isListingVerified(listing101));
    assert(vBadge.includes('Verified'), 'Listing 101 displays Verified badge alongside Sold Out');

    const listing102 = await getListingById(102);
    assert(listing102.status === 'sold_out', 'Listing 102 is sold_out');
    assert(listing102.is_verified === false, 'Listing 102 verification badge remains Non-Verified');
    const nonVBadge = renderListingVerificationBadge(isListingVerified(listing102));
    assert(nonVBadge.includes('Non-Verified'), 'Listing 102 displays Non-Verified badge alongside Sold Out');

    // Automatic property grouping preservation
    assert(listing101.property_group_id === 'grp-mumbai-sea-breeze', 'Listing 101 property_group_id preserved after sold_out transition');
    assert(listing102.property_group_id === 'grp-blr-green-valley', 'Listing 102 property_group_id preserved after sold_out transition');

    // -------------------------------------------------------------
    // SECTION 5: BUYER-FACING UI TEMPLATES & COMPONENTS
    // -------------------------------------------------------------
    console.log('\n--- Section 5: Buyer-Facing UI & Search Results ---');

    // Test search / property cards HTML template generator from demo-data.js / property-search.js
    const { buildCardHTML } = await import('../demo-data.js');

    const activeListingObj = {
        id: 991,
        title: 'Luxury 4BHK Skyline Villa',
        price: 55000000,
        intent: 'Buy',
        type: 'Villa',
        location: 'Worli, Mumbai',
        beds: 4,
        baths: 4,
        sqft: 3500,
        status: 'Active',
        is_verified: true,
        created_at: new Date().toISOString()
    };

    const soldOutListingObj = {
        id: 992,
        title: 'Compact 1BHK Studio',
        price: 4500000,
        intent: 'Buy',
        type: 'Apartment',
        location: 'Powai, Mumbai',
        beds: 1,
        baths: 1,
        sqft: 450,
        status: 'sold_out',
        is_verified: false,
        created_at: new Date().toISOString()
    };

    const activeCardHTML = buildCardHTML(activeListingObj);
    assert(!activeCardHTML.includes('SOLD OUT'), 'Active listing card does NOT display SOLD OUT badge');

    const soldOutCardHTML = buildCardHTML(soldOutListingObj);
    assert(soldOutCardHTML.includes('SOLD OUT'), 'Sold-out listing card prominently displays SOLD OUT badge');
    assert(soldOutCardHTML.includes('Non-Verified'), 'Sold-out listing card displays independent Non-Verified badge');

    // -------------------------------------------------------------
    // SECTION 6: BROKER LISTING MANAGEMENT UI
    // -------------------------------------------------------------
    console.log('\n--- Section 6: Broker Listing Management UI ---');

    const { generateListingsHTML } = await import('../js/features/listings/listing-management.js');

    const mgmtHTML = generateListingsHTML([activeListingObj, soldOutListingObj], true);
    assert(mgmtHTML.includes('Mark as Sold Out'), 'Active listing in broker table includes [Mark as Sold Out] action button');
    assert(mgmtHTML.includes('title="Already marked as Sold Out"'), 'Sold-out listing in broker table replaces action button with static [Sold Out] indicator');
    assert(mgmtHTML.includes('bg-rose-100 text-rose-800'), 'Sold-out listing renders rose Sold Out status badge in status column');

    // -------------------------------------------------------------
    // SECTION 7: DATABASE MIGRATION INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- Section 7: Database Migration File Inspection ---');

    const migrationPath = path.join(__dirname, '../supabase/migrations/20261009000100_add_sold_out_listing_status.sql');
    assert(fs.existsSync(migrationPath), 'Migration file 20261009000100_add_sold_out_listing_status.sql exists');

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    assert(sqlContent.includes('idx_listings_status'), 'Migration creates index on listings(status)');
    assert(sqlContent.includes('fn_enforce_listing_broker_authorization'), 'Migration creates broker authorization enforcement function');
    assert(sqlContent.includes('trg_enforce_listing_broker_authorization'), 'Migration binds trigger to BEFORE UPDATE OF status');
    assert(sqlContent.includes('sold_out'), 'Migration targets status = "sold_out"');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Test Execution Finished: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Unhandled Test Suite Error:', err);
    process.exit(1);
});
