/**
 * Admin Export Service
 * Generates and downloads standard Excel (.xlsx) workbooks for Admin oversight.
 * 
 * Worksheets included:
 *  1. Summary   - Platform metrics, export timestamp, admin info
 *  2. Users     - Platform user accounts and roles
 *  3. Listings  - Property listings and moderation statuses
 *  4. Reports   - Moderation queue and user reports
 * 
 * Pure data operations & XLSX generation with zero direct UI assumptions.
 */

import * as XLSX from 'xlsx';
import { supabase as defaultSupabase } from '../core/supabase-client.js';

let isExporting = false;

/**
 * Format a YYYY-MM-DD date string for filenames using current/specified date.
 * @param {Date} [d=new Date()]
 * @returns {string} e.g. "2026-10-19"
 */
export function getExportDateSlug(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Get standard export filename for Excel (.xlsx).
 * @param {Date} [d=new Date()]
 * @returns {string} e.g. "projectx-admin-export-2026-10-19.xlsx"
 */
export function getAdminExportFilename(d = new Date()) {
    return `projectx-admin-export-${getExportDateSlug(d)}.xlsx`;
}

/**
 * Pure workbook generator from structured datasets.
 * Suitable for both browser and Node.js test execution.
 * 
 * @param {Object} datasets
 * @param {Object} [datasets.summary]
 * @param {Array<Object>} [datasets.users]
 * @param {Array<Object>} [datasets.listings]
 * @param {Array<Object>} [datasets.reports]
 * @param {Date} [_now] Optional deterministic Date for testing
 * @returns {XLSX.WorkBook} SheetJS WorkBook object
 */
export function generateAdminExportWorkbook({ summary = {}, users = [], listings = [], reports = [] } = {}, _now = new Date()) {
    const wb = XLSX.utils.book_new();

    // ── 1. Worksheet: Summary ──
    const summaryRows = [
        ['EstatePro / ProjectX - System Administration Export', ''],
        ['Generated At', _now.toISOString()],
        ['Generated Local Time', _now.toLocaleString('en-IN')],
        ['Export Format', 'Excel Workbook (.xlsx)'],
        ['Platform Metrics', ''],
        ['Total Registered Users', summary.totalUsers ?? users.length],
        ['Active Listings', summary.activeListings ?? 0],
        ['Registered Brokers', summary.totalBrokers ?? 0],
        ['Client Inquiries', summary.totalInquiries ?? 0],
        ['Pending Reports', summary.pendingReports ?? 0],
        ['Export Scope', 'Full Platform Snapshot (Admin Authorization)'],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    // Set auto-fit column widths
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // ── 2. Worksheet: Users ──
    const userHeaders = ['User ID', 'Full Name', 'Role', 'Status', 'Last Active', 'Created At'];
    const userRows = users.length > 0
        ? users.map(u => {
            const lastActive = u.updated_at ? new Date(u.updated_at).toLocaleString('en-IN') : '—';
            const createdAt = u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : '—';
            const isActive = u.updated_at ? (new Date(_now) - new Date(u.updated_at) < 3600000) : false;
            return [
                u.id || '—',
                u.full_name || 'Anonymous User',
                u.role || 'Buyer',
                isActive ? 'Active' : 'Offline',
                lastActive,
                createdAt
            ];
        })
        : [['No user records found', '', '', '', '', '']];
    const wsUsers = XLSX.utils.aoa_to_sheet([userHeaders, ...userRows]);
    wsUsers['!cols'] = [{ wch: 38 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Users');

    // ── 3. Worksheet: Listings ──
    const listingHeaders = [
        'Listing ID', 'Title', 'Location', 'Price (INR)', 'Intent', 'Type',
        'Status', 'Beds', 'Baths', 'SqFt', 'Views', 'Broker ID',
        'Assigned Employee ID', 'Verified', 'Sold Out', 'Available From', 'Created At'
    ];
    const listingRows = listings.length > 0
        ? listings.map(l => [
            l.id,
            l.title || 'Untitled',
            l.location || '—',
            typeof l.price === 'number' ? l.price : Number(l.price || 0),
            l.intent || 'Buy',
            l.type || '—',
            l.status || 'Active',
            l.beds ?? 0,
            l.baths ?? 0,
            l.sqft ?? 0,
            l.views ?? 0,
            l.broker_id || '—',
            l.assigned_employee_id || 'Unassigned',
            l.is_verified === true ? 'Yes' : 'No',
            l.is_sold_out === true ? 'Yes' : 'No',
            l.available_from || 'Immediate',
            l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '—'
        ])
        : [['No listing records found', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']];
    const wsListings = XLSX.utils.aoa_to_sheet([listingHeaders, ...listingRows]);
    wsListings['!cols'] = [
        { wch: 12 }, { wch: 32 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
        { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 38 },
        { wch: 38 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsListings, 'Listings');

    // ── 4. Worksheet: Reports ──
    const reportHeaders = [
        'Report ID', 'Reporter Name', 'Reporter Role', 'Target Type',
        'Target ID', 'Reason', 'Description', 'Status', 'Created At'
    ];
    const reportRows = reports.length > 0
        ? reports.map(r => [
            r.id,
            r.profiles?.full_name || r.reporter_name || 'Anonymous',
            r.profiles?.role || r.reporter_role || 'User',
            r.target_type || '—',
            r.target_id || '—',
            r.reason || '—',
            r.description || '—',
            r.status || 'Pending',
            r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'
        ])
        : [['No moderation reports logged', '', '', '', '', '', '', '', '']];
    const wsReports = XLSX.utils.aoa_to_sheet([reportHeaders, ...reportRows]);
    wsReports['!cols'] = [
        { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
        { wch: 38 }, { wch: 26 }, { wch: 36 }, { wch: 14 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsReports, 'Reports');

    return wb;
}

/**
 * Fetch all platform datasets required for Admin Export while respecting RLS.
 * 
 * @param {Object} [supabaseClient=defaultSupabase]
 * @returns {Promise<{ summary: Object, users: Array, listings: Array, reports: Array }>}
 */
export async function fetchAdminExportData(supabaseClient = defaultSupabase) {
    // 1. Authorization Verification
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const session = sessionData?.session;
    if (!session || !session.user) {
        throw new Error('Authentication required. Please sign in as an Administrator.');
    }

    const { data: userProfile, error: profileErr } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (profileErr || !userProfile || (userProfile.role !== 'Admin' && userProfile.role !== 'Employee')) {
        throw new Error('Unauthorized: Administrator or Employee role required for data export.');
    }

    // 2. Query stats & counts in parallel
    const [
        { count: totalUsers },
        { count: activeListings },
        { count: totalBrokers },
        { count: totalInquiries },
        { count: pendingReports },
        { data: users, error: usersErr },
        { data: listings, error: listingsErr },
        { data: reports, error: reportsErr }
    ] = await Promise.all([
        supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
        supabaseClient.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'Broker'),
        supabaseClient.from('inquiries').select('*', { count: 'exact', head: true }),
        supabaseClient.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabaseClient.from('profiles').select('id, full_name, role, updated_at, created_at').order('created_at', { ascending: false }),
        supabaseClient.from('listings').select('id, title, location, price, intent, type, status, beds, baths, sqft, views, broker_id, assigned_employee_id, is_verified, is_sold_out, available_from, created_at').order('created_at', { ascending: false }),
        supabaseClient.from('reports').select('id, reporter_id, target_type, target_id, reason, description, status, created_at, profiles:reporter_id(full_name, role)').order('created_at', { ascending: false })
    ]);

    if (usersErr) console.warn('Admin export warning - could not fetch users:', usersErr.message);
    if (listingsErr) console.warn('Admin export warning - could not fetch listings:', listingsErr.message);
    if (reportsErr) console.warn('Admin export warning - could not fetch reports:', reportsErr.message);

    return {
        summary: {
            totalUsers: totalUsers || 0,
            activeListings: activeListings || 0,
            totalBrokers: totalBrokers || 0,
            totalInquiries: totalInquiries || 0,
            pendingReports: pendingReports || 0
        },
        users: users || [],
        listings: listings || [],
        reports: reports || []
    };
}

/**
 * Triggers the browser Excel export flow.
 * 
 * @param {Object} [options]
 * @param {Object} [options.supabaseClient=defaultSupabase]
 * @param {Function} [options.showToast]
 * @param {HTMLElement} [options.buttonElement]
 * @returns {Promise<boolean>}
 */
export async function triggerAdminExcelExport({
    supabaseClient = defaultSupabase,
    showToast = (msg, isErr) => console.log(msg, isErr),
    buttonElement = null
} = {}) {
    if (isExporting) {
        showToast('Export already in progress. Please wait...', false);
        return false;
    }

    isExporting = true;
    let originalButtonHtml = '';

    if (buttonElement) {
        originalButtonHtml = buttonElement.innerHTML;
        buttonElement.disabled = true;
        buttonElement.classList.add('opacity-75', 'cursor-not-allowed');
        buttonElement.innerHTML = `
            <span class="material-symbols-outlined text-[18px] animate-spin">sync</span>
            <span>Exporting...</span>
        `;
    }

    try {
        // 1. Gather data with security check
        const data = await fetchAdminExportData(supabaseClient);

        // 2. Generate standard XLSX workbook
        const now = new Date();
        const workbook = generateAdminExportWorkbook(data, now);
        const filename = getAdminExportFilename(now);

        // 3. Convert to Excel binary and create Blob
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        // 4. Trigger browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`✓ Exported ${filename} successfully`);
        return true;
    } catch (err) {
        console.error('Admin Excel export error:', err);
        showToast(err.message || 'Failed to export Excel report.', true);
        return false;
    } finally {
        isExporting = false;
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.classList.remove('opacity-75', 'cursor-not-allowed');
            buttonElement.innerHTML = originalButtonHtml;
        }
    }
}
