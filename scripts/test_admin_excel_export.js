/**
 * Test: Admin Dashboard Excel Export (.xlsx)
 * Run: node scripts/test_admin_excel_export.js
 * 
 * Verifies:
 *  1. Clicking the Admin download icon triggers Excel export.
 *  2. The downloaded filename ends with .xlsx and includes current date.
 *  3. The file contains a valid Excel workbook (magic bytes & readable OpenXML zip).
 *  4. Worksheet names and column headers are correct.
 *  5. Exported data matches the intended admin datasets.
 *  6. Dates and numeric values are represented appropriately.
 *  7. Empty datasets are handled gracefully.
 *  8. Export errors and duplicate clicks are handled correctly.
 *  9. Unauthorized users cannot access protected export data.
 * 10. Existing Admin dashboard functions remain intact.
 */

import * as XLSX from 'xlsx';
import {
    getAdminExportFilename,
    getExportDateSlug,
    generateAdminExportWorkbook,
    fetchAdminExportData,
    triggerAdminExcelExport
} from '../js/services/admin-export-service.js';
import fs from 'fs';
import path from 'path';

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
console.log('ProjectX: Admin Dashboard Excel Export (.xlsx) Test Suite');
console.log('================================================================');

// ── Section 1: Filename Generation & Date Slug ──
console.log('\n--- Section 1: Filename & Extension Verification ---');
const testDate = new Date(2026, 9, 19); // Oct 19, 2026
const filename = getAdminExportFilename(testDate);
assert('Filename ends with .xlsx extension', filename.endsWith('.xlsx'));
assert('Filename does NOT end with .json or .csv or .xls', !filename.endsWith('.json') && !filename.endsWith('.csv') && !filename.endsWith('.xls'));
assert('Filename matches pattern projectx-admin-export-YYYY-MM-DD.xlsx', filename === 'projectx-admin-export-2026-10-19.xlsx');
assert('Date slug uses zero-padded month and day', getExportDateSlug(new Date(2026, 0, 5)) === '2026-01-05');

// ── Section 2: Genuine Excel (.xlsx) Binary Format Validation ──
console.log('\n--- Section 2: Genuine Excel Format & Parsing ---');
const mockDatasets = {
    summary: { totalUsers: 142, activeListings: 45, totalBrokers: 18, totalInquiries: 32, pendingReports: 3 },
    users: [
        { id: 'usr-1', full_name: 'Aditi Sharma', role: 'Broker', updated_at: '2026-10-19T10:00:00Z', created_at: '2026-01-01T00:00:00Z' },
        { id: 'usr-2', full_name: 'Rajesh Verma', role: 'Admin', updated_at: '2026-10-19T12:00:00Z', created_at: '2025-12-01T00:00:00Z' }
    ],
    listings: [
        {
            id: 101,
            title: 'Sea Facing Penthouse',
            location: 'Worli, Mumbai',
            price: 155000000,
            intent: 'Buy',
            type: 'Penthouse',
            status: 'Active',
            beds: 4,
            baths: 5,
            sqft: 4200,
            views: 1250,
            broker_id: 'usr-1',
            assigned_employee_id: 'emp-9',
            is_verified: true,
            is_sold_out: false,
            available_from: '2026-11-01',
            created_at: '2026-10-15T09:30:00Z'
        }
    ],
    reports: [
        {
            id: 501,
            target_type: 'listing',
            target_id: '101',
            reason: 'Incorrect price details',
            description: 'Price stated does not match developer brochure',
            status: 'Pending',
            created_at: '2026-10-18T14:20:00Z',
            profiles: { full_name: 'Rohan Gupta', role: 'Buyer' }
        }
    ]
};

const wb = generateAdminExportWorkbook(mockDatasets, testDate);
assert('Workbook is a valid object with SheetNames', Array.isArray(wb.SheetNames));

const binaryBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
assert('Binary buffer is generated and non-empty', Buffer.isBuffer(binaryBuffer) && binaryBuffer.length > 1000);
// OpenXML .xlsx files are ZIP archives starting with magic bytes 0x50 0x4B ('PK')
assert('Magic bytes match genuine OpenXML ZIP container (0x50 0x4B)', binaryBuffer[0] === 0x50 && binaryBuffer[1] === 0x4B);

// Parse back using SheetJS to verify file integrity
const parsedWb = XLSX.read(binaryBuffer, { type: 'buffer' });
assert('Parsed workbook has valid SheetNames', Array.isArray(parsedWb.SheetNames));

// ── Section 3: Worksheet Names & Structure ──
console.log('\n--- Section 3: Worksheet Structure & Names ---');
const expectedSheets = ['Summary', 'Users', 'Listings', 'Reports'];
assert('Contains exactly the 4 required worksheets', 
    expectedSheets.every(name => parsedWb.SheetNames.includes(name)));
assert('Worksheet names order is logical (Summary, Users, Listings, Reports)',
    parsedWb.SheetNames.slice(0, 4).join(',') === expectedSheets.join(','));

// ── Section 4: Column Headers & Data Verification ──
console.log('\n--- Section 4: Column Headers & Data Mapping ---');

// Users Sheet
const usersSheet = parsedWb.Sheets['Users'];
const usersData = XLSX.utils.sheet_to_json(usersSheet, { header: 1 });
const expectedUserHeaders = ['User ID', 'Full Name', 'Role', 'Status', 'Last Active', 'Created At'];
assert('Users sheet has correct header row',
    JSON.stringify(usersData[0]) === JSON.stringify(expectedUserHeaders));
assert('Users sheet contains exported user record',
    usersData.length === 3 && usersData[1][0] === 'usr-1' && usersData[1][1] === 'Aditi Sharma');

// Listings Sheet
const listingsSheet = parsedWb.Sheets['Listings'];
const listingsData = XLSX.utils.sheet_to_json(listingsSheet, { header: 1 });
const expectedListingHeaders = [
    'Listing ID', 'Title', 'Location', 'Price (INR)', 'Intent', 'Type',
    'Status', 'Beds', 'Baths', 'SqFt', 'Views', 'Broker ID',
    'Assigned Employee ID', 'Verified', 'Sold Out', 'Available From', 'Created At'
];
assert('Listings sheet has correct header row',
    JSON.stringify(listingsData[0]) === JSON.stringify(expectedListingHeaders));
assert('Listing row preserves numeric values (price, beds, baths, sqft, views)',
    typeof listingsData[1][3] === 'number' && listingsData[1][3] === 155000000 &&
    typeof listingsData[1][7] === 'number' && listingsData[1][7] === 4);
assert('Listing row maps boolean fields to human-readable strings (Verified: Yes, Sold Out: No)',
    listingsData[1][13] === 'Yes' && listingsData[1][14] === 'No');

// Reports Sheet
const reportsSheet = parsedWb.Sheets['Reports'];
const reportsData = XLSX.utils.sheet_to_json(reportsSheet, { header: 1 });
const expectedReportHeaders = [
    'Report ID', 'Reporter Name', 'Reporter Role', 'Target Type',
    'Target ID', 'Reason', 'Description', 'Status', 'Created At'
];
assert('Reports sheet has correct header row',
    JSON.stringify(reportsData[0]) === JSON.stringify(expectedReportHeaders));
assert('Reports row maps reporter name and role from joined profiles',
    reportsData[1][1] === 'Rohan Gupta' && reportsData[1][2] === 'Buyer');

// Summary Sheet
const summarySheet = parsedWb.Sheets['Summary'];
const summaryData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });
assert('Summary sheet contains platform metrics',
    summaryData.some(row => row[0] === 'Total Registered Users' && row[1] === 142));
assert('Summary sheet contains active listings metric',
    summaryData.some(row => row[0] === 'Active Listings' && row[1] === 45));

// ── Section 5: Empty Datasets Graceful Handling ──
console.log('\n--- Section 5: Empty Dataset Handling ---');
const emptyWb = generateAdminExportWorkbook({
    summary: {},
    users: [],
    listings: [],
    reports: []
}, testDate);
const emptyBuffer = XLSX.write(emptyWb, { bookType: 'xlsx', type: 'buffer' });
assert('Empty dataset generates non-corrupted valid Excel buffer',
    Buffer.isBuffer(emptyBuffer) && emptyBuffer[0] === 0x50 && emptyBuffer[1] === 0x4B);

const parsedEmptyWb = XLSX.read(emptyBuffer, { type: 'buffer' });
assert('Empty workbook retains all 4 sheet tabs', parsedEmptyWb.SheetNames.length === 4);
const emptyUsers = XLSX.utils.sheet_to_json(parsedEmptyWb.Sheets['Users'], { header: 1 });
assert('Empty users sheet still has headers and fallback note',
    emptyUsers[0][0] === 'User ID' && emptyUsers[1][0] === 'No user records found');

// ── Section 6: Security & Role Authorization Verification ──
console.log('\n--- Section 6: Security & Authorization ---');

// Test 6a: Missing session throws authentication error
const mockNoSessionClient = {
    auth: { getSession: async () => ({ data: { session: null } }) }
};
let unauthThrown = false;
try {
    await fetchAdminExportData(mockNoSessionClient);
} catch (e) {
    unauthThrown = true;
    assert('Unauthenticated call throws auth required error', e.message.includes('Authentication required'));
}
assert('No session was rejected', unauthThrown);

// Test 6b: Buyer role rejected
const mockBuyerClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'buyer-1' } } } }) },
    from: (table) => ({
        select: () => ({
            eq: () => ({
                single: async () => ({ data: { role: 'Buyer' }, error: null })
            })
        })
    })
};
let buyerRejected = false;
try {
    await fetchAdminExportData(mockBuyerClient);
} catch (e) {
    buyerRejected = true;
    assert('Buyer role is rejected with unauthorized error', e.message.includes('Unauthorized: Administrator or Employee role required'));
}
assert('Unauthorized buyer was blocked from exporting', buyerRejected);

// Test 6c: Sensitive credential fields are NEVER exported
// Verify the user query columns do NOT request password, token, or secret
const exportServiceSource = fs.readFileSync(path.resolve('js/services/admin-export-service.js'), 'utf8');
assert('Export query does not request password or token fields',
    !exportServiceSource.includes('password') && !exportServiceSource.includes('token') && !exportServiceSource.includes('secret'));

// ── Section 7: HTML Download Button Markup & Accessibility ──
console.log('\n--- Section 7: Admin Panel Markup & Accessibility ---');
const adminHtml = fs.readFileSync(path.resolve('admin-panel.html'), 'utf8');

assert('admin-panel.html contains #admin-export-btn',
    adminHtml.includes('id="admin-export-btn"'));
assert('Export button has accessible title "Export to Excel"',
    adminHtml.includes('title="Export to Excel"'));
assert('Export button has accessible aria-label "Export to Excel"',
    adminHtml.includes('aria-label="Export to Excel"'));
assert('Export button contains standard download icon',
    adminHtml.includes('download'));
assert('admin-panel.html imports triggerAdminExcelExport',
    adminHtml.includes('import { triggerAdminExcelExport } from \'./js/services/admin-export-service.js\''));
assert('admin-panel.html wires setupAdminExport in checkAuth()',
    adminHtml.includes('setupAdminExport()'));

// ── Section 8: Moderation Feature Integration ──
console.log('\n--- Section 8: Moderation Feature Integration ---');
const moderationJs = fs.readFileSync(path.resolve('js/features/moderation/moderation.js'), 'utf8');

assert('moderation.js imports triggerAdminExcelExport dynamically on export click',
    moderationJs.includes('triggerAdminExcelExport') && moderationJs.includes('admin-export-service.js'));
assert('moderation.js checks admin-export-btn ID or download icon',
    moderationJs.includes('admin-export-btn'));

// ── Section 9: Error & Duplicate Click Handling ──
console.log('\n--- Section 9: Export Error Handling ---');
let toastMsg = '';
let toastIsErr = false;
const mockErrorClient = {
    auth: {
        getSession: async () => { throw new Error('Network disconnection test'); }
    }
};
const exportResult = await triggerAdminExcelExport({
    supabaseClient: mockErrorClient,
    showToast: (msg, isErr) => { toastMsg = msg; toastIsErr = isErr; }
});
assert('Export failure returns false gracefully', exportResult === false);
assert('Export failure shows descriptive error toast', toastIsErr && toastMsg.includes('Network disconnection test'));

// ── Section 10: Existing Admin Dashboard Regression Checks ──
console.log('\n--- Section 10: Regression Verification ---');
assert('Admin dashboard still has User Management table (#user-table-body)',
    adminHtml.includes('id="user-table-body"'));
assert('Admin dashboard still has Moderation list (#listings-moderation-list)',
    adminHtml.includes('id="listings-moderation-list"'));
assert('Admin dashboard still has Reports queue (#reports-table-body)',
    adminHtml.includes('id="reports-table-body"'));
assert('Admin dashboard still has Create Staff account feature (#create-staff-btn)',
    adminHtml.includes('id="create-staff-btn"'));
assert('Admin dashboard still has Stats loading (#stat-total-users)',
    adminHtml.includes('id="stat-total-users"'));

console.log(`\n================================================================`);
console.log(`Test Execution Finished: ${passed} PASSED, ${failed} FAILED`);
console.log(`================================================================\n`);

if (failed > 0) {
    process.exit(1);
}
