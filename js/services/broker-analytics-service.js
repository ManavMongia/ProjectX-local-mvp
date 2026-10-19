/**
 * Broker Analytics Service
 * Pure data operations and calculations for broker dashboard analytics.
 * Zero DOM dependencies, fully testable in Node and browser.
 */

import { supabase } from '../core/supabase-client.js';

export const DATE_RANGES = {
    'all': { label: 'All Time', days: null },
    '7d': { label: 'Last 7 Days', days: 7 },
    '30d': { label: 'Last 30 Days', days: 30 },
    '90d': { label: 'Last 90 Days', days: 90 }
};

/**
 * Normalizes an area / neighborhood string for consistent grouping.
 * Strips city suffixes like ", Mumbai", trims whitespace, and title-cases.
 *
 * @param {string} rawLocation
 * @returns {string|null}
 */
export function normalizeAreaName(rawLocation) {
    if (!rawLocation || typeof rawLocation !== 'string') return null;
    const trimmed = rawLocation.trim();
    if (!trimmed) return null;

    // Take locality before comma if present (e.g. "Bandra West, Mumbai" -> "Bandra West")
    const primaryPart = trimmed.split(',')[0].trim();
    if (!primaryPart) return null;

    // Normalize spacing and title-case words for clean aggregation
    return primaryPart
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Filters a list of inquiry records by a specified date range.
 *
 * @param {Array<Object>} inquiries
 * @param {string} rangeKey 'all' | '7d' | '30d' | '90d'
 * @param {number} [referenceTime] Current timestamp override for testing
 * @returns {Array<Object>}
 */
export function filterInquiriesByDateRange(inquiries, rangeKey = 'all', referenceTime = Date.now()) {
    if (!Array.isArray(inquiries)) return [];
    const config = DATE_RANGES[rangeKey] || DATE_RANGES['all'];
    if (!config.days) return [...inquiries];

    const cutoffMs = referenceTime - (config.days * 24 * 60 * 60 * 1000);
    return inquiries.filter(inq => {
        if (!inq || !inq.created_at) return false;
        const inqTime = new Date(inq.created_at).getTime();
        return !isNaN(inqTime) && inqTime >= cutoffMs;
    });
}

/**
 * Calculates Average Days to Inquiry from actual listing and inquiry timestamps.
 * Formula: Sum(inquiry.created_at - listing.created_at) / Number of eligible inquiries.
 *
 * Rules:
 * - Must belong to eligible listings of the broker.
 * - Missing or invalid timestamps are excluded.
 * - Negative durations (inquiry created before listing) are excluded.
 * - Division by zero is prevented.
 *
 * @param {Array<Object>} listings
 * @param {Array<Object>} inquiries
 * @returns {Object} { value, formatted, count, hasData }
 */
export function calculateAverageDaysToInquiry(listings, inquiries) {
    if (!Array.isArray(listings) || !Array.isArray(inquiries) || inquiries.length === 0 || listings.length === 0) {
        return { value: null, formatted: 'N/A', count: 0, hasData: false };
    }

    const listingMap = new Map();
    listings.forEach(l => {
        if (l && l.id !== undefined && l.id !== null) {
            listingMap.set(String(l.id), l);
        }
    });

    let totalDays = 0;
    let validCount = 0;

    inquiries.forEach(inq => {
        if (!inq || !inq.created_at || inq.listing_id === undefined || inq.listing_id === null) {
            return;
        }

        const listing = listingMap.get(String(inq.listing_id));
        if (!listing || !listing.created_at) {
            return;
        }

        const inqTime = new Date(inq.created_at).getTime();
        const listingTime = new Date(listing.created_at).getTime();

        if (isNaN(inqTime) || isNaN(listingTime)) {
            return;
        }

        const diffMs = inqTime - listingTime;
        // Exclude negative durations
        if (diffMs < 0) {
            return;
        }

        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        totalDays += diffDays;
        validCount++;
    });

    if (validCount === 0) {
        return { value: null, formatted: 'N/A', count: 0, hasData: false };
    }

    const avg = totalDays / validCount;
    const rounded = Number(avg.toFixed(1));
    return {
        value: rounded,
        formatted: `${rounded} days`,
        count: validCount,
        hasData: true
    };
}

/**
 * Evaluates Inquiry to Viewing Conversion based on actual database records.
 *
 * Note on schema capabilities:
 * The current database schema stores customer inquiries (`inquiries`), but does not
 * store completed viewing progression status or a separate `viewings` table.
 * Per Product Requirements: When the database does not track viewing progression,
 * we display N/A rather than fabricating a conversion rate.
 *
 * @param {Array<Object>} inquiries
 * @param {Array<Object>} [viewingRecords] Optional viewing records if provided in tests or future migrations
 * @returns {Object} { value, formatted, rate, hasData, reason }
 */
export function calculateInquiryToViewingConversion(inquiries, viewingRecords = null) {
    // If external viewing records are provided (e.g. in test suites or future migrations)
    if (Array.isArray(viewingRecords)) {
        if (!Array.isArray(inquiries) || inquiries.length === 0) {
            return {
                value: null,
                formatted: 'N/A',
                rate: null,
                eligibleInquiries: 0,
                confirmedViewings: 0,
                hasData: false,
                reason: 'No inquiries in the selected reporting period.'
            };
        }

        // Deduplicate viewings by inquiry_id to prevent double-counting
        const uniqueConvertedInquiryIds = new Set();
        viewingRecords.forEach(v => {
            if (v && v.inquiry_id && (v.status === 'confirmed' || v.status === 'completed' || v.confirmed === true)) {
                uniqueConvertedInquiryIds.add(String(v.inquiry_id));
            }
        });

        const eligibleInquiryCount = inquiries.length;
        const convertedCount = uniqueConvertedInquiryIds.size;
        const rate = (convertedCount / eligibleInquiryCount) * 100;
        const rounded = Number(rate.toFixed(0));

        return {
            value: rounded,
            formatted: `${rounded}%`,
            rate: rate,
            eligibleInquiries: eligibleInquiryCount,
            confirmedViewings: convertedCount,
            hasData: true
        };
    }

    // Default: Schema does not track viewing events
    return {
        value: null,
        formatted: 'N/A',
        rate: null,
        eligibleInquiries: Array.isArray(inquiries) ? inquiries.length : 0,
        confirmedViewings: 0,
        hasData: false,
        reason: 'Viewing progression is not tracked in the current database schema.'
    };
}

/**
 * Calculates the Top Area with the highest actual inquiry engagement.
 *
 * Methodology:
 * 1. Associate each eligible inquiry with its listing.
 * 2. Group inquiries by the listing's normalized area.
 * 3. Count inquiries per area.
 * 4. Return the area with the highest count.
 *
 * @param {Array<Object>} listings
 * @param {Array<Object>} inquiries
 * @returns {Object} { area, formatted, count, totalAreas, hasData }
 */
export function calculateTopArea(listings, inquiries) {
    if (!Array.isArray(listings) || !Array.isArray(inquiries) || inquiries.length === 0 || listings.length === 0) {
        return { area: null, formatted: 'N/A', count: 0, totalAreas: 0, hasData: false };
    }

    const listingMap = new Map();
    listings.forEach(l => {
        if (l && l.id !== undefined && l.id !== null) {
            listingMap.set(String(l.id), l);
        }
    });

    const areaCounts = new Map();

    inquiries.forEach(inq => {
        if (!inq || inq.listing_id === undefined || inq.listing_id === null) return;
        const listing = listingMap.get(String(inq.listing_id));
        if (!listing || !listing.location) return;

        const normalizedArea = normalizeAreaName(listing.location);
        if (!normalizedArea) return;

        areaCounts.set(normalizedArea, (areaCounts.get(normalizedArea) || 0) + 1);
    });

    if (areaCounts.size === 0) {
        return { area: null, formatted: 'N/A', count: 0, totalAreas: 0, hasData: false };
    }

    let topArea = null;
    let maxCount = -1;

    for (const [area, count] of areaCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            topArea = area;
        }
    }

    return {
        area: topArea,
        formatted: topArea,
        count: maxCount,
        totalAreas: areaCounts.size,
        hasData: true
    };
}

/**
 * Generates transparent, data-supported performance summary text.
 * Strictly avoids generic/unsupported marketing claims.
 *
 * @param {Object} params
 * @returns {string}
 */
export function generatePerformanceSummary({
    avgDaysResult,
    conversionResult,
    topAreaResult,
    totalListings = 0,
    totalInquiries = 0,
    dateRangeLabel = 'All Time'
}) {
    if (totalListings === 0) {
        return 'You currently have no active listings in your portfolio. Add listings to start generating buyer inquiries and tracking engagement trends.';
    }

    if (totalInquiries === 0) {
        const listingWord = totalListings === 1 ? 'listing' : 'listings';
        return `You have ${totalListings} active ${listingWord}, but have received no inquiries during ${dateRangeLabel.toLowerCase()}. Performance trends will appear here once prospective buyers inquire.`;
    }

    const parts = [];
    const inqWord = totalInquiries === 1 ? 'inquiry' : 'inquiries';
    const areaWord = topAreaResult?.totalAreas === 1 ? 'area' : 'areas';

    parts.push(`Your portfolio received ${totalInquiries} ${inqWord} across ${topAreaResult?.totalAreas || 1} ${areaWord} (${dateRangeLabel.toLowerCase()}).`);

    if (topAreaResult && topAreaResult.hasData) {
        parts.push(`Highest buyer engagement occurred in ${topAreaResult.area} with ${topAreaResult.count} ${topAreaResult.count === 1 ? 'inquiry' : 'inquiries'}.`);
    }

    if (avgDaysResult && avgDaysResult.hasData) {
        parts.push(`Average turnaround from listing to inquiry was ${avgDaysResult.formatted}.`);
    }

    if (conversionResult && conversionResult.hasData) {
        parts.push(`Inquiry-to-viewing conversion rate is ${conversionResult.formatted}.`);
    } else {
        parts.push('Inquiry-to-viewing conversion is currently unavailable pending viewing event tracking.');
    }

    return parts.join(' ');
}

/**
 * Fetches broker-owned listings and inquiries, respecting RLS and broker isolation,
 * then computes all analytics metrics for the selected date range.
 *
 * @param {string} brokerId
 * @param {string} [dateRangeKey='all']
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<Object>}
 */
export async function fetchBrokerAnalyticsData(brokerId, dateRangeKey = 'all', supabaseClient = supabase) {
    if (!brokerId) {
        throw new Error('Authentication required: broker ID is missing.');
    }

    // 1. Fetch only listings belonging to the authenticated broker (minimal fields)
    const { data: listings, error: listingsError } = await supabaseClient
        .from('listings')
        .select('id, created_at, location, broker_id, title')
        .eq('broker_id', brokerId);

    if (listingsError) {
        console.error('Error fetching broker listings for analytics:', listingsError);
        throw listingsError;
    }

    // 2. Fetch only inquiries belonging to the authenticated broker (minimal fields, no private buyer contact details)
    const { data: inquiries, error: inquiriesError } = await supabaseClient
        .from('inquiries')
        .select('id, created_at, listing_id, broker_id, type')
        .eq('broker_id', brokerId);

    if (inquiriesError) {
        console.error('Error fetching broker inquiries for analytics:', inquiriesError);
        throw inquiriesError;
    }

    const safeListings = listings || [];
    const safeInquiries = inquiries || [];

    // 3. Apply date range filtering to inquiries
    const dateConfig = DATE_RANGES[dateRangeKey] || DATE_RANGES['all'];
    const filteredInquiries = filterInquiriesByDateRange(safeInquiries, dateRangeKey);

    // 4. Calculate metrics
    const avgDaysResult = calculateAverageDaysToInquiry(safeListings, filteredInquiries);
    const conversionResult = calculateInquiryToViewingConversion(filteredInquiries);
    const topAreaResult = calculateTopArea(safeListings, filteredInquiries);
    const summary = generatePerformanceSummary({
        avgDaysResult,
        conversionResult,
        topAreaResult,
        totalListings: safeListings.length,
        totalInquiries: filteredInquiries.length,
        dateRangeLabel: dateConfig.label
    });

    return {
        brokerId,
        dateRange: dateRangeKey,
        dateRangeLabel: dateConfig.label,
        totalListings: safeListings.length,
        totalInquiries: filteredInquiries.length,
        avgDays: avgDaysResult,
        conversion: conversionResult,
        topArea: topAreaResult,
        summary
    };
}
