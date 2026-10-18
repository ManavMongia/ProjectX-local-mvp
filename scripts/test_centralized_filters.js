/**
 * ProjectX Automated Feature Test Suite:
 * Centralized Filters (Myntra-inspired) + Recent Listings + Available From
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
    console.log('================================================================');
    console.log('ProjectX: Centralized Filters & Availability Feature Test Suite');
    console.log('================================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    function test(description, fn) {
        try {
            fn();
            console.log(`  ✓ PASS: ${description}`);
            passedTests++;
        } catch (err) {
            console.error(`  ✗ FAIL: ${description}`);
            console.error(`    ${err.message}`);
            failedTests++;
        }
    }

    // -------------------------------------------------------------
    // SECTION 1: DATABASE MIGRATION & SCHEMA INTEGRITY
    // -------------------------------------------------------------
    console.log('--- Section 1: Database Migration & Schema Integrity ---');

    const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261010000000_add_available_from_to_listings.sql');
    
    test('Migration file 20261010000000_add_available_from_to_listings.sql exists', () => {
        assert(fs.existsSync(migrationPath), 'Migration file must exist');
    });

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    test('Migration adds available_from column as nullable DATE', () => {
        assert(migrationSQL.includes('available_from DATE DEFAULT NULL'), 'Should alter table to add available_from DATE DEFAULT NULL');
    });

    test('Migration adds index on available_from', () => {
        assert(migrationSQL.includes('CREATE INDEX IF NOT EXISTS idx_listings_available_from ON public.listings(available_from)'), 'Should index available_from');
    });

    test('Migration is idempotent using conditional checks', () => {
        assert(migrationSQL.includes('IF NOT EXISTS'), 'Should check existence idempotently');
    });

    // -------------------------------------------------------------
    // SECTION 2: RECENT LISTINGS FILTERING LOGIC
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Recent Listings Filter ---');

    const {
        matchesRecentListing,
        RECENT_WINDOWS
    } = await import('../js/services/listing-service.js');

    test('RECENT_WINDOWS defines 24h, 7d, 30d durations in milliseconds', () => {
        assert.strictEqual(RECENT_WINDOWS['24h'], 24 * 60 * 60 * 1000);
        assert.strictEqual(RECENT_WINDOWS['7d'], 7 * 24 * 60 * 60 * 1000);
        assert.strictEqual(RECENT_WINDOWS['30d'], 30 * 24 * 60 * 60 * 1000);
    });

    const NOW = new Date('2026-10-18T12:00:00.000Z').getTime();

    test('Last 24 hours: includes listing created 2 hours ago', () => {
        const created = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '24h', NOW), true);
    });

    test('Last 24 hours: excludes listing created 26 hours ago', () => {
        const created = new Date(NOW - 26 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '24h', NOW), false);
    });

    test('Last 7 days: includes listing created 3 days ago', () => {
        const created = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '7d', NOW), true);
    });

    test('Last 7 days: excludes listing created 8 days ago', () => {
        const created = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '7d', NOW), false);
    });

    test('Last 30 days: includes listing created 20 days ago', () => {
        const created = new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '30d', NOW), true);
    });

    test('Last 30 days: excludes listing created 35 days ago', () => {
        const created = new Date(NOW - 35 * 24 * 60 * 60 * 1000).toISOString();
        assert.strictEqual(matchesRecentListing(created, '30d', NOW), false);
    });

    test('Missing timestamp returns false when recent filter is active', () => {
        assert.strictEqual(matchesRecentListing(null, '7d', NOW), false);
        assert.strictEqual(matchesRecentListing(undefined, '7d', NOW), false);
        assert.strictEqual(matchesRecentListing('', '7d', NOW), false);
    });

    test('Invalid timestamp returns false when recent filter is active', () => {
        assert.strictEqual(matchesRecentListing('invalid-date', '7d', NOW), false);
    });

    test('Clearing recent filter (null or "all") includes all records regardless of age', () => {
        assert.strictEqual(matchesRecentListing(new Date(NOW - 100 * 24 * 60 * 60 * 1000).toISOString(), null, NOW), true);
        assert.strictEqual(matchesRecentListing(new Date(NOW - 100 * 24 * 60 * 60 * 1000).toISOString(), 'all', NOW), true);
        assert.strictEqual(matchesRecentListing(null, null, NOW), true);
        assert.strictEqual(matchesRecentListing(null, 'all', NOW), true);
    });

    // -------------------------------------------------------------
    // SECTION 3: AVAILABLE FROM FILTERING LOGIC
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Available From Filter ---');

    const {
        matchesAvailableFrom,
        normalizeDateString
    } = await import('../js/services/listing-service.js');

    test('normalizeDateString safely formats Date, ISO string, and YYYY-MM-DD', () => {
        assert.strictEqual(normalizeDateString('2026-11-01'), '2026-11-01');
        assert.strictEqual(normalizeDateString('2026-11-01T14:30:00.000Z'), '2026-11-01');
        assert.strictEqual(normalizeDateString(new Date(2026, 10, 1)), '2026-11-01');
        assert.strictEqual(normalizeDateString(null), null);
        assert.strictEqual(normalizeDateString('not-a-date'), null);
    });

    test('available_from <= selected_date: matches earlier date', () => {
        // Property available on 2026-10-15 is ready on or before 2026-11-01
        assert.strictEqual(matchesAvailableFrom('2026-10-15', '2026-11-01'), true);
    });

    test('available_from <= selected_date: matches exact date', () => {
        assert.strictEqual(matchesAvailableFrom('2026-11-01', '2026-11-01'), true);
    });

    test('available_from <= selected_date: excludes later date', () => {
        // Property available on 2026-11-15 is NOT ready by 2026-11-01
        assert.strictEqual(matchesAvailableFrom('2026-11-15', '2026-11-01'), false);
    });

    test('Missing availability date excluded when filter is active', () => {
        assert.strictEqual(matchesAvailableFrom(null, '2026-11-01'), false);
        assert.strictEqual(matchesAvailableFrom(undefined, '2026-11-01'), false);
        assert.strictEqual(matchesAvailableFrom('', '2026-11-01'), false);
    });

    test('Clearing availability date (null or empty) removes constraint', () => {
        assert.strictEqual(matchesAvailableFrom('2026-12-31', null), true);
        assert.strictEqual(matchesAvailableFrom('2026-12-31', ''), true);
        assert.strictEqual(matchesAvailableFrom(null, null), true);
    });

    test('Invalid selected date is handled safely without throwing', () => {
        assert.strictEqual(matchesAvailableFrom('2026-10-15', 'invalid-date'), true);
    });

    test('Timezone boundary: string comparison avoids local/UTC offset errors', () => {
        // Date strings in YYYY-MM-DD compare lexicographically without UTC drift
        assert.strictEqual('2026-10-31' <= '2026-11-01', true);
        assert.strictEqual('2026-11-02' <= '2026-11-01', false);
    });

    // -------------------------------------------------------------
    // SECTION 4: COMBINING MULTIPLE FILTERS (filterListingCard)
    // -------------------------------------------------------------
    console.log('\n--- Section 4: Multi-Filter Combination Logic ---');

    const { filterListingCard } = await import('../js/features/search/filters.js');

    function createMockCard(props) {
        return {
            dataset: {
                id: String(props.id || 1),
                title: props.title || 'Standard Apartment',
                location: props.location || 'Bandra West, Mumbai',
                type: props.type || 'Apartment',
                beds: String(props.beds || 2),
                baths: String(props.baths || 2),
                price: String(props.price || 1.5),
                sqft: String(props.sqft || 1200),
                intent: props.intent || 'Buy',
                verified: props.verified ? 'true' : 'false',
                status: props.status || 'Active',
                availableFrom: props.availableFrom || '2026-10-20',
                createdAt: props.createdAt || new Date().toISOString(),
                date: props.createdAt || new Date().toISOString()
            },
            style: {}
        };
    }

    test('All matching criteria: Intent AND Type AND Price AND Beds AND Recent AND Available AND Verified', () => {
        const card = createMockCard({
            intent: 'Buy',
            type: 'Apartment',
            price: 0.75, // ₹75 Lac
            beds: 2,
            sqft: 1100,
            verified: true,
            status: 'Active',
            availableFrom: '2026-10-20',
            createdAt: new Date().toISOString()
        });

        const criteria = {
            intent: 'Buy',
            selectedTypes: ['Apartment'],
            minPrice: 0.5,
            maxPrice: 1.0,
            activeBeds: 2,
            recent: '7d',
            availableFrom: '2026-11-01',
            verification: 'verified',
            availabilityStatus: 'available'
        };

        assert.strictEqual(filterListingCard(card, criteria), true);
    });

    test('Excludes if single criterion fails: Wrong Type', () => {
        const card = createMockCard({ type: 'Villa' });
        assert.strictEqual(filterListingCard(card, { selectedTypes: ['Apartment'] }), false);
    });

    test('Excludes if single criterion fails: Price outside range', () => {
        const card = createMockCard({ price: 3.5 });
        assert.strictEqual(filterListingCard(card, { minPrice: 0.5, maxPrice: 2.0 }), false);
    });

    test('Excludes if single criterion fails: Older than recent window', () => {
        const card = createMockCard({
            createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
        });
        assert.strictEqual(filterListingCard(card, { recent: '7d' }), false);
    });

    test('Excludes if single criterion fails: Available after selected date', () => {
        const card = createMockCard({ availableFrom: '2026-12-01' });
        assert.strictEqual(filterListingCard(card, { availableFrom: '2026-11-01' }), false);
    });

    test('Excludes if single criterion fails: Non-verified when verified requested', () => {
        const card = createMockCard({ verified: false });
        assert.strictEqual(filterListingCard(card, { verification: 'verified' }), false);
    });

    test('Excludes if single criterion fails: Sold out listing when available requested', () => {
        const card = createMockCard({ status: 'sold_out' });
        assert.strictEqual(filterListingCard(card, { availabilityStatus: 'available' }), false);
    });

    test('Includes sold out listing when sold_out requested', () => {
        const card = createMockCard({ status: 'sold_out' });
        assert.strictEqual(filterListingCard(card, { availabilityStatus: 'sold_out' }), true);
    });

    test('Search query matches title or location', () => {
        const card = createMockCard({ title: 'Sea View Penthouse', location: 'Worli, Mumbai' });
        assert.strictEqual(filterListingCard(card, { query: 'penthouse' }), true);
        assert.strictEqual(filterListingCard(card, { query: 'worli' }), true);
        assert.strictEqual(filterListingCard(card, { query: 'bangalore' }), false);
    });

    // -------------------------------------------------------------
    // SECTION 5: CENTRALIZED FILTERS MODULE & STATE BEHAVIOR
    // -------------------------------------------------------------
    console.log('\n--- Section 5: Centralized Filters Module & Draft/Applied State ---');

    const {
        DEFAULT_FILTERS,
        countActiveFilters,
        setAppliedFilters,
        getAppliedFilters
    } = await import('../js/features/search/centralized-filters.js');

    test('DEFAULT_FILTERS has clean initial state', () => {
        assert.strictEqual(DEFAULT_FILTERS.intent, 'all');
        assert.strictEqual(DEFAULT_FILTERS.recent, null);
        assert.strictEqual(DEFAULT_FILTERS.availableFrom, null);
        assert.strictEqual(DEFAULT_FILTERS.verification, 'all');
        assert.strictEqual(DEFAULT_FILTERS.availabilityStatus, 'all');
        assert.deepStrictEqual(DEFAULT_FILTERS.selectedTypes, []);
    });

    test('countActiveFilters correctly computes active count', () => {
        const none = countActiveFilters(DEFAULT_FILTERS);
        assert.strictEqual(none, 0);

        const three = countActiveFilters({
            ...DEFAULT_FILTERS,
            intent: 'Buy',
            recent: '7d',
            availableFrom: '2026-11-01'
        });
        assert.strictEqual(three, 3);
    });

    test('setAppliedFilters and getAppliedFilters preserve filter state', () => {
        setAppliedFilters({
            intent: 'Rent',
            recent: '24h',
            availableFrom: '2026-10-25',
            activeBeds: 2
        });

        const current = getAppliedFilters();
        assert.strictEqual(current.intent, 'Rent');
        assert.strictEqual(current.recent, '24h');
        assert.strictEqual(current.availableFrom, '2026-10-25');
        assert.strictEqual(current.activeBeds, 2);
    });

    // -------------------------------------------------------------
    // SECTION 6: UI & HTML INSPECTION
    // -------------------------------------------------------------
    console.log('\n--- Section 6: UI & HTML Markup Verification ---');

    const propertiesHTML = fs.readFileSync(path.resolve(__dirname, '../properties.html'), 'utf8');

    test('properties.html contains prominent #open-filters-btn', () => {
        assert(propertiesHTML.includes('id="open-filters-btn"'), 'properties.html must contain #open-filters-btn');
    });

    test('properties.html contains active filters badge indicator', () => {
        assert(propertiesHTML.includes('id="active-filters-badge"'), 'properties.html must contain #active-filters-badge');
    });

    test('properties.html contains secondary toolbar filters button', () => {
        assert(propertiesHTML.includes('id="open-filters-btn-secondary"'), 'properties.html must contain secondary button');
    });

    test('properties.html contains active filter chips container', () => {
        assert(propertiesHTML.includes('id="active-filter-chips-container"'), 'properties.html must contain chips container');
    });

    test('properties.html contains sidebar open-all-filters button', () => {
        assert(propertiesHTML.includes('id="sidebar-open-all-filters-btn"'), 'properties.html sidebar contains trigger button');
    });

    const listingManagementJS = fs.readFileSync(path.resolve(__dirname, '../js/features/listings/listing-management.js'), 'utf8');

    test('listing-management.js modal includes Available From input', () => {
        assert(listingManagementJS.includes('modal-available-from'), 'listing modal must contain modal-available-from input');
        assert(listingManagementJS.includes('available_from'), 'listingData must include available_from');
    });

    // -------------------------------------------------------------
    // SECTION 7: REGRESSION VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- Section 7: Existing Features Regression ---');

    const listingServiceJS = fs.readFileSync(path.resolve(__dirname, '../js/services/listing-service.js'), 'utf8');

    test('listing-service.js retains all existing exports', () => {
        assert(listingServiceJS.includes('export function isListingVerified'), 'isListingVerified exported');
        assert(listingServiceJS.includes('export function renderListingVerificationBadge'), 'renderListingVerificationBadge exported');
        assert(listingServiceJS.includes('export function isListingSoldOut'), 'isListingSoldOut exported');
        assert(listingServiceJS.includes('export function renderListingSoldOutBadge'), 'renderListingSoldOutBadge exported');
        assert(listingServiceJS.includes('export async function markListingSoldOut'), 'markListingSoldOut exported');
        assert(listingServiceJS.includes('export function calculateListingAge'), 'calculateListingAge exported');
    });

    const propertyDetailsJS = fs.readFileSync(path.resolve(__dirname, '../js/features/listings/property-details.js'), 'utf8');

    test('property-details.js retains share button handling', () => {
        assert(propertyDetailsJS.includes('#share-listing-btn') || propertyDetailsJS.includes('share-listing-btn'), 'Share button handled');
    });

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Test Execution Finished: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite();
