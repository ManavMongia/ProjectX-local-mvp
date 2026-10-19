/**
 * Broker Analytics Feature Module
 * Connects the Broker Dashboard Analytics UI with real Supabase calculations.
 * Handles loading, data-driven rendering, empty states, error recovery, and date filtering.
 */

import {
    fetchBrokerAnalyticsData,
    DATE_RANGES
} from '../../services/broker-analytics-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { showToast } from '../../ui/toast.js';

let currentBrokerId = null;
let activeDateRangeKey = 'all';
const AVAILABLE_RANGES = ['all', '7d', '30d', '90d'];

/**
 * Sets subtle loading indicator in the Analytics cards.
 */
function setAnalyticsLoadingState() {
    const avgDaysEl = document.getElementById('stat-avg-days-to-inquiry');
    const conversionEl = document.getElementById('stat-inquiry-to-viewing');
    const topAreaEl = document.getElementById('stat-top-area');
    const summaryEl = document.getElementById('stat-performance-summary');

    if (avgDaysEl) avgDaysEl.textContent = '...';
    if (conversionEl) conversionEl.textContent = '...';
    if (topAreaEl) topAreaEl.textContent = '...';
    if (summaryEl) summaryEl.textContent = 'Loading performance analytics...';

    const errorBox = document.getElementById('analytics-error-state');
    if (errorBox) errorBox.classList.add('hidden');
}

/**
 * Renders calculated analytics metrics into the Broker Dashboard DOM.
 *
 * @param {string} brokerId
 * @param {string} dateRangeKey
 */
export async function renderBrokerAnalytics(brokerId = currentBrokerId, dateRangeKey = activeDateRangeKey) {
    if (!brokerId) {
        const user = await getCurrentUser();
        if (user) {
            brokerId = user.id;
            currentBrokerId = user.id;
        } else {
            console.warn('Cannot render analytics: authenticated broker ID is unavailable.');
            return;
        }
    }

    setAnalyticsLoadingState();

    try {
        const data = await fetchBrokerAnalyticsData(brokerId, dateRangeKey);
        
        // 1. Average Days to Inquiry
        const avgDaysEl = document.getElementById('stat-avg-days-to-inquiry');
        const avgDaysDesc = document.getElementById('stat-avg-days-desc');
        if (avgDaysEl) {
            avgDaysEl.textContent = data.avgDays.formatted;
        }
        if (avgDaysDesc) {
            avgDaysDesc.textContent = data.avgDays.hasData
                ? `Based on ${data.avgDays.count} ${data.avgDays.count === 1 ? 'inquiry' : 'inquiries'} with valid listing dates.`
                : 'No inquiries recorded during this period.';
        }

        // 2. Inquiry to Viewing Conversion
        const conversionEl = document.getElementById('stat-inquiry-to-viewing');
        const conversionDesc = document.getElementById('stat-inquiry-to-viewing-desc');
        if (conversionEl) {
            conversionEl.textContent = data.conversion.formatted;
        }
        if (conversionDesc) {
            conversionDesc.textContent = data.conversion.hasData
                ? `Conversion from ${data.conversion.eligibleInquiries} leads to confirmed visits.`
                : 'Confirmed viewing tracking is not supported by current database schema.';
        }

        // 3. Top Area
        const topAreaEl = document.getElementById('stat-top-area');
        const topAreaDesc = document.getElementById('stat-top-area-desc');
        if (topAreaEl) {
            topAreaEl.textContent = data.topArea.formatted;
        }
        if (topAreaDesc) {
            topAreaDesc.textContent = data.topArea.hasData
                ? `${data.topArea.count} ${data.topArea.count === 1 ? 'inquiry' : 'inquiries'} received (${data.dateRangeLabel.toLowerCase()}).`
                : 'No geographic engagement recorded yet.';
        }

        // 4. Performance Summary
        const summaryEl = document.getElementById('stat-performance-summary');
        if (summaryEl) {
            summaryEl.textContent = data.summary;
        }

        // 5. Update date filter button label
        const filterText = document.getElementById('analytics-date-filter-text');
        if (filterText) {
            filterText.textContent = data.dateRangeLabel;
        }

        const errorBox = document.getElementById('analytics-error-state');
        if (errorBox) errorBox.classList.add('hidden');
    } catch (err) {
        console.error('Failed to load broker analytics:', err);
        const errorBox = document.getElementById('analytics-error-state');
        const errorMsg = document.getElementById('analytics-error-message');
        if (errorBox) {
            errorBox.classList.remove('hidden');
            if (errorMsg) errorMsg.textContent = 'Unable to load analytics. Please try again.';
        }

        const avgDaysEl = document.getElementById('stat-avg-days-to-inquiry');
        const conversionEl = document.getElementById('stat-inquiry-to-viewing');
        const topAreaEl = document.getElementById('stat-top-area');
        const summaryEl = document.getElementById('stat-performance-summary');

        if (avgDaysEl) avgDaysEl.textContent = 'N/A';
        if (conversionEl) conversionEl.textContent = 'N/A';
        if (topAreaEl) topAreaEl.textContent = 'N/A';
        if (summaryEl) summaryEl.textContent = 'Analytics data is temporarily unavailable due to a query failure.';

        showToast('Error loading analytics data.', true);
    }
}

/**
 * Initializes listeners and bindings for the Broker Analytics tab.
 *
 * @param {string} brokerId
 */
export async function initBrokerAnalyticsManager(brokerId) {
    currentBrokerId = brokerId;

    // Date Range cycling button
    const dateBtn = document.getElementById('analytics-date-filter-btn');
    if (dateBtn) {
        dateBtn.onclick = (e) => {
            e.preventDefault();
            const currentIdx = AVAILABLE_RANGES.indexOf(activeDateRangeKey);
            const nextIdx = (currentIdx + 1) % AVAILABLE_RANGES.length;
            activeDateRangeKey = AVAILABLE_RANGES[nextIdx];
            renderBrokerAnalytics(currentBrokerId, activeDateRangeKey);
            showToast(`Analytics filtered to ${DATE_RANGES[activeDateRangeKey].label}`);
        };
    }

    // Retry button on error
    const retryBtn = document.getElementById('retry-analytics-btn');
    if (retryBtn) {
        retryBtn.onclick = (e) => {
            e.preventDefault();
            renderBrokerAnalytics(currentBrokerId, activeDateRangeKey);
        };
    }

    // Initial render
    await renderBrokerAnalytics(currentBrokerId, activeDateRangeKey);
}
