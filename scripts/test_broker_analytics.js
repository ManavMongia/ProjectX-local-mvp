/**
 * Test: Broker Dashboard Analytics - Real Data Driven Calculations
 * Run: node scripts/test_broker_analytics.js
 *
 * Verifies:
 *  1. Average Days to Inquiry uses correct timestamps (inquiry - listing).
 *  2. Invalid and missing timestamps are safely excluded.
 *  3. Negative durations (inquiry before listing) are excluded and do not corrupt the average.
 *  4. No valid inquiries produces an appropriate empty state (N/A, hasData = false).
 *  5. Inquiry-to-Viewing conversion uses correct numerator and denominator when viewings exist.
 *  6. Duplicate viewing records on the same inquiry do not inflate conversion rate.
 *  7. Zero inquiries does not cause division by zero in conversion.
 *  8. Top Area is derived from actual eligible inquiry engagement.
 *  9. Missing locations / null locations are safely handled without crashes.
 * 10. Performance summary accurately reflects calculated metrics without generic or unsupported marketing claims.
 * 11. Selected date ranges (7d, 30d, 90d, all) are applied consistently to inquiries.
 * 12. Broker data isolation: Broker A's calculation excludes Broker B's listings/inquiries.
 * 13. Query failures do not fall back to dummy data.
 * 14. HTML file contains all required semantic IDs and navigation links.
 * 15. Minimal field selection protects buyer privacy (no phone/email in select query).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    normalizeAreaName,
    filterInquiriesByDateRange,
    calculateAverageDaysToInquiry,
    calculateInquiryToViewingConversion,
    calculateTopArea,
    generatePerformanceSummary,
    fetchBrokerAnalyticsData,
    DATE_RANGES
} from '../js/services/broker-analytics-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log('\n── Section 1: Average Days to Inquiry Calculation ──\n');

// 1. Correct calculation
const listingsSample1 = [
    { id: 101, created_at: '2026-10-10T10:00:00Z', location: 'Bandra West, Mumbai' },
    { id: 102, created_at: '2026-10-12T10:00:00Z', location: 'Worli, Mumbai' }
];
const inquiriesSample1 = [
    // 2 days after listing 101
    { id: 1, listing_id: 101, created_at: '2026-10-12T10:00:00Z' },
    // 4 days after listing 101
    { id: 2, listing_id: 101, created_at: '2026-10-14T10:00:00Z' },
    // 1 day after listing 102
    { id: 3, listing_id: 102, created_at: '2026-10-13T10:00:00Z' }
];
// Average = (2 + 4 + 1) / 3 = 7 / 3 = 2.333... -> 2.3 days
const res1 = calculateAverageDaysToInquiry(listingsSample1, inquiriesSample1);
assert('Calculates average days correctly (2.3 days)', res1.formatted === '2.3 days');
assert('Calculates accurate rounded numerical value (2.3)', res1.value === 2.3);
assert('Reports valid count of 3 inquiries', res1.count === 3);
assert('Flags hasData = true', res1.hasData === true);

// 2. Invalid and missing timestamps excluded
const inquiriesWithInvalidDates = [
    { id: 1, listing_id: 101, created_at: '2026-10-12T10:00:00Z' }, // 2 days
    { id: 2, listing_id: 101, created_at: null },                    // missing inquiry date
    { id: 3, listing_id: 101, created_at: 'not-a-valid-date' },       // garbage inquiry date
    { id: 4, listing_id: 999, created_at: '2026-10-14T10:00:00Z' }   // unassociated listing
];
const res2 = calculateAverageDaysToInquiry(listingsSample1, inquiriesWithInvalidDates);
assert('Excludes invalid/missing inquiry timestamps and unmapped listings', res2.count === 1);
assert('Average days for single valid inquiry is 2.0 days', res2.formatted === '2 days');

// 3. Negative durations excluded
const inquiriesWithNegativeDiff = [
    { id: 1, listing_id: 101, created_at: '2026-10-12T10:00:00Z' }, // +2 days
    { id: 2, listing_id: 101, created_at: '2026-10-08T10:00:00Z' }  // -2 days (before listing was created!)
];
const res3 = calculateAverageDaysToInquiry(listingsSample1, inquiriesWithNegativeDiff);
assert('Excludes negative duration inquiries', res3.count === 1);
assert('Calculates average without negative duration pollution (2 days)', res3.formatted === '2 days');

// 4. No valid inquiries / empty state
const res4 = calculateAverageDaysToInquiry(listingsSample1, []);
assert('Empty inquiries produces N/A', res4.formatted === 'N/A' && res4.hasData === false && res4.count === 0);

const res4b = calculateAverageDaysToInquiry([], inquiriesSample1);
assert('Empty listings produces N/A', res4b.formatted === 'N/A' && res4b.hasData === false);

console.log('\n── Section 2: Inquiry to Viewing Conversion ──\n');

// 5. Default current schema behavior: no viewing progression exists
const convDefault = calculateInquiryToViewingConversion(inquiriesSample1);
assert('Displays N/A when database schema lacks viewing tracking', convDefault.formatted === 'N/A');
assert('hasData is false when viewing tracking is not present', convDefault.hasData === false);
assert('Provides clear schema rationale for N/A', convDefault.reason.includes('not tracked'));

// 6. When viewing records are provided (e.g. mock test / future migration)
const mockInquiries = [
    { id: 'inq-1' },
    { id: 'inq-2' },
    { id: 'inq-3' },
    { id: 'inq-4' }
];
const mockViewings = [
    { inquiry_id: 'inq-1', status: 'confirmed' },
    { inquiry_id: 'inq-2', status: 'confirmed' }
];
const convMock = calculateInquiryToViewingConversion(mockInquiries, mockViewings);
assert('Conversion calculates (2 / 4) * 100 = 50%', convMock.formatted === '50%');
assert('Correct eligible inquiries denominator (4)', convMock.eligibleInquiries === 4);
assert('Correct confirmed viewings numerator (2)', convMock.confirmedViewings === 2);

// 7. Duplicate viewing records on same inquiry do not inflate conversion
const duplicateViewings = [
    { inquiry_id: 'inq-1', status: 'confirmed' },
    { inquiry_id: 'inq-1', status: 'confirmed' }, // duplicate entry
    { inquiry_id: 'inq-2', status: 'confirmed' }
];
const convDedup = calculateInquiryToViewingConversion(mockInquiries, duplicateViewings);
assert('Duplicate viewing events are deduplicated (still 50%)', convDedup.formatted === '50%');
assert('Deduplicated numerator is 2', convDedup.confirmedViewings === 2);

// 8. Zero inquiries does not divide by zero
const convZero = calculateInquiryToViewingConversion([], mockViewings);
assert('Zero inquiries yields N/A without division by zero', convZero.formatted === 'N/A');
assert('Eligible inquiries is 0', convZero.eligibleInquiries === 0);

console.log('\n── Section 3: Top Area Engagement ──\n');

// 9. Area normalization
assert('Normalizes "Bandra West, Mumbai" -> "Bandra West"', normalizeAreaName('Bandra West, Mumbai') === 'Bandra West');
assert('Normalizes "  juhu , mumbai " -> "Juhu"', normalizeAreaName('  juhu , mumbai ') === 'Juhu');
assert('Handles empty string safely', normalizeAreaName('') === null);
assert('Handles null safely', normalizeAreaName(null) === null);

// 10. Top Area calculation
const listingsWithAreas = [
    { id: 1, location: 'Bandra West, Mumbai' },
    { id: 2, location: 'Khar West, Mumbai' },
    { id: 3, location: 'Bandra West' }
];
const inquiriesAreas = [
    { id: 'a', listing_id: 1 },
    { id: 'b', listing_id: 3 },
    { id: 'c', listing_id: 1 }, // 3 inquiries in Bandra West
    { id: 'd', listing_id: 2 }  // 1 inquiry in Khar West
];
const topAreaRes = calculateTopArea(listingsWithAreas, inquiriesAreas);
assert('Identifies top area as "Bandra West"', topAreaRes.area === 'Bandra West');
assert('Counts 3 inquiries for top area', topAreaRes.count === 3);
assert('Counts 2 total distinct areas', topAreaRes.totalAreas === 2);
assert('hasData is true', topAreaRes.hasData === true);

// 11. Missing / null locations handled safely
const listingsMissingLocation = [
    { id: 1, location: null },
    { id: 2, location: '' }
];
const topAreaEmpty = calculateTopArea(listingsMissingLocation, inquiriesAreas);
assert('Returns N/A when listing locations are null or missing', topAreaEmpty.formatted === 'N/A');
assert('hasData is false when no valid locations', topAreaEmpty.hasData === false);

console.log('\n── Section 4: Performance Summary Generation ──\n');

// 12. Rule-based transparent summary
const summaryWithData = generatePerformanceSummary({
    avgDaysResult: { formatted: '2.3 days', hasData: true },
    conversionResult: { formatted: 'N/A', hasData: false },
    topAreaResult: { area: 'Bandra West', count: 3, totalAreas: 2, hasData: true },
    totalListings: 4,
    totalInquiries: 4,
    dateRangeLabel: 'Last 30 Days'
});
assert('Mentions total inquiries and areas', summaryWithData.includes('4 inquiries across 2 areas (last 30 days)'));
assert('Mentions top engagement area and inquiry count', summaryWithData.includes('Highest buyer engagement occurred in Bandra West with 3 inquiries'));
assert('Mentions average turnaround', summaryWithData.includes('Average turnaround from listing to inquiry was 2.3 days'));
assert('Does not make generic claims like "steady visibility"', !summaryWithData.includes('steady visibility'));

// 13. Summary for zero listings
const summaryNoListings = generatePerformanceSummary({
    avgDaysResult: { hasData: false },
    conversionResult: { hasData: false },
    topAreaResult: { hasData: false },
    totalListings: 0,
    totalInquiries: 0
});
assert('Accurately reports empty portfolio state', summaryNoListings.includes('no active listings'));

// 14. Summary for listings but zero inquiries
const summaryNoInquiries = generatePerformanceSummary({
    avgDaysResult: { hasData: false },
    conversionResult: { hasData: false },
    topAreaResult: { hasData: false },
    totalListings: 3,
    totalInquiries: 0,
    dateRangeLabel: 'Last 7 Days'
});
assert('Accurately reports zero inquiries for period', summaryNoInquiries.includes('received no inquiries during last 7 days'));

console.log('\n── Section 5: Date Range Filtering ──\n');

// 15. Date filtering
const fixedNow = new Date('2026-10-19T12:00:00Z').getTime();
const datedInquiries = [
    { id: 1, created_at: '2026-10-18T12:00:00Z' }, // 1 day ago
    { id: 2, created_at: '2026-10-10T12:00:00Z' }, // 9 days ago
    { id: 3, created_at: '2026-09-01T12:00:00Z' }, // 48 days ago
    { id: 4, created_at: '2026-06-01T12:00:00Z' }  // 140 days ago
];

const inq7d = filterInquiriesByDateRange(datedInquiries, '7d', fixedNow);
assert('7d range contains only 1 inquiry', inq7d.length === 1 && inq7d[0].id === 1);

const inq30d = filterInquiriesByDateRange(datedInquiries, '30d', fixedNow);
assert('30d range contains 2 inquiries', inq30d.length === 2);

const inq90d = filterInquiriesByDateRange(datedInquiries, '90d', fixedNow);
assert('90d range contains 3 inquiries', inq90d.length === 3);

const inqAll = filterInquiriesByDateRange(datedInquiries, 'all', fixedNow);
assert('all range contains all 4 inquiries', inqAll.length === 4);

console.log('\n── Section 6: Broker Data Isolation & Security ──\n');

// 16. Test fetchBrokerAnalyticsData queries with mocked Supabase client
const mockDb = {
    listings: [
        { id: 1, broker_id: 'broker-A', title: 'Villa A', created_at: '2026-10-01T00:00:00Z', location: 'Bandra West' },
        { id: 2, broker_id: 'broker-B', title: 'Villa B', created_at: '2026-10-01T00:00:00Z', location: 'Juhu' }
    ],
    inquiries: [
        { id: 10, broker_id: 'broker-A', listing_id: 1, created_at: '2026-10-03T00:00:00Z' },
        { id: 20, broker_id: 'broker-B', listing_id: 2, created_at: '2026-10-04T00:00:00Z' }
    ]
};

const mockSupabaseClient = {
    from: (table) => {
        let selectedFields = '*';
        return {
            select: (fields) => {
                selectedFields = fields;
                return {
                    eq: async (col, val) => {
                        // Ensure we never select private contact fields (buyer phone, email)
                        assert(`Query on ${table} does not request private email or phone`, !selectedFields.includes('email') && !selectedFields.includes('phone'));
                        const records = (mockDb[table] || []).filter(item => item[col] === val);
                        return { data: records, error: null };
                    }
                };
            }
        };
    }
};

const brokerAData = await fetchBrokerAnalyticsData('broker-A', 'all', mockSupabaseClient);
assert('Broker A fetches only Broker A listings (count = 1)', brokerAData.totalListings === 1);
assert('Broker A fetches only Broker A inquiries (count = 1)', brokerAData.totalInquiries === 1);
assert('Broker A top area is Bandra West', brokerAData.topArea.area === 'Bandra West');

const brokerBData = await fetchBrokerAnalyticsData('broker-B', 'all', mockSupabaseClient);
assert('Broker B fetches only Broker B listings (count = 1)', brokerBData.totalListings === 1);
assert('Broker B top area is Juhu', brokerBData.topArea.area === 'Juhu');

// 17. Query failure handling (does not fabricate fallback dummy data)
const failingSupabaseClient = {
    from: () => ({
        select: () => ({
            eq: async () => ({ data: null, error: new Error('Network error or RLS denial') })
        })
    })
};

let queryFailedAsExpected = false;
try {
    await fetchBrokerAnalyticsData('broker-A', 'all', failingSupabaseClient);
} catch (err) {
    queryFailedAsExpected = true;
}
assert('Database query failure throws error instead of fabricating dummy values', queryFailedAsExpected);

console.log('\n── Section 7: HTML DOM Structure & Navigation Verification ──\n');

const htmlPath = path.join(__dirname, '..', 'broker-dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert('HTML has #tab-analytics element', htmlContent.includes('id="tab-analytics"'));
assert('HTML has #nav-analytics in desktop sidebar', htmlContent.includes('id="nav-analytics"'));
assert('HTML has mobile nav button for #analytics-section', htmlContent.includes('data-tab="#analytics-section"'));
assert('HTML has #stat-avg-days-to-inquiry element', htmlContent.includes('id="stat-avg-days-to-inquiry"'));
assert('HTML has #stat-avg-days-desc element', htmlContent.includes('id="stat-avg-days-desc"'));
assert('HTML has #stat-inquiry-to-viewing element', htmlContent.includes('id="stat-inquiry-to-viewing"'));
assert('HTML has #stat-inquiry-to-viewing-desc element', htmlContent.includes('id="stat-inquiry-to-viewing-desc"'));
assert('HTML has #stat-top-area element', htmlContent.includes('id="stat-top-area"'));
assert('HTML has #stat-top-area-desc element', htmlContent.includes('id="stat-top-area-desc"'));
assert('HTML has #stat-performance-summary element', htmlContent.includes('id="stat-performance-summary"'));
assert('HTML has #analytics-date-filter-btn', htmlContent.includes('id="analytics-date-filter-btn"'));
assert('HTML has #analytics-error-state', htmlContent.includes('id="analytics-error-state"'));
assert('HTML has #retry-analytics-btn', htmlContent.includes('id="retry-analytics-btn"'));

// Check that hardcoded dummy values were removed from markup
assert('Hardcoded dummy value "2.8" is removed from tab-analytics markup', !htmlContent.includes('<h3 class="font-h3 text-h3 text-primary">2.8</h3>'));
assert('Hardcoded dummy value "31%" is removed from tab-analytics markup', !htmlContent.includes('<h3 class="font-h3 text-h3 text-primary">31%</h3>'));
assert('Hardcoded static text "Your active inventory is receiving steady visibility" is removed', !htmlContent.includes('Your active inventory is receiving steady visibility'));

console.log(`\n========================================`);
console.log(`Broker Dashboard Analytics Tests: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
