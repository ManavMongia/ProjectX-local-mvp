/**
 * ProjectX Application Entry Point
 * Modular Architecture Coordinator
 * 
 * Future React Migration:
 * This coordinator dispatches to the feature and UI layer modules.
 * Business and data logic reside independently in /js/services/
 * with zero DOM dependencies, ready for React migration.
 */

import { checkAuth } from './js/features/authentication/auth-guard.js';
import { initLoginPage } from './js/features/authentication/login.js';
import { initBuyerHomePage, initBuyerListingsPage } from './js/features/search/property-search.js';
import { initBuyerMapPage } from './js/features/maps/map.js';
import { initBuyerDetailsPage } from './js/features/listings/property-details.js';
import { initSellPage } from './js/features/sell/sell.js';
import { initBrokerDashboardPage } from './js/features/broker/broker-dashboard.js';
import { initAdminPanelInteractions, initEmployeePanelInteractions } from './js/features/moderation/moderation.js';
import { injectReportModal } from './js/features/moderation/reporting.js';
import { initRouter } from './js/core/router.js';
import { resolveCurrentPage, isAuthOrLoginPage } from './js/core/app-state.js';
import {
    initTouchDropdowns,
    wireCommonLinks,
    normalizeInternalLinks,
    updateHeaderVisibility
} from './js/ui/navigation.js';
import { formatListingPrice, formatIntentLabel } from './js/services/listing-service.js';

// Global utility bindings for inline HTML templates
window.formatListingPrice = formatListingPrice;
window.formatIntentLabel = formatIntentLabel;

/**
 * Initializes interactions and features for the active page.
 * Invoked on initial load and on every SPA page transition.
 */
export function initAppPage() {
    const currentPage = resolveCurrentPage();
    const userRole = localStorage.getItem('role');
    const isLoginPage = isAuthOrLoginPage(currentPage);

    normalizeInternalLinks();
    wireCommonLinks();
    initTouchDropdowns();
    updateHeaderVisibility();
    injectReportModal();

    if (isLoginPage) {
        initLoginPage();
    } else if (userRole === 'Broker' && currentPage === 'broker-dashboard.html') {
        initBrokerDashboardPage();
    } else if (currentPage === 'index.html') {
        initBuyerHomePage();
    } else if (currentPage === 'properties.html') {
        initBuyerListingsPage();
    } else if (currentPage === 'map.html') {
        initBuyerMapPage();
    } else if (currentPage === 'property-details.html') {
        initBuyerDetailsPage();
    } else if (currentPage === 'sell.html') {
        initSellPage();
    }

    if (userRole === 'Admin' && currentPage === 'admin-panel.html') {
        initAdminPanelInteractions();
    }

    if (userRole === 'Employee' && currentPage === 'employee-panel.html') {
        initEmployeePanelInteractions();
    }

    // Execute registered SPA page initializer if one was registered for this page
    if (window.spaPageInit && typeof window.spaPageInit[currentPage] === 'function') {
        try {
            window.spaPageInit[currentPage]();
        } catch (e) {
            console.error(`Error executing SPA page initializer for ${currentPage}:`, e);
        }
    }

    window.initAppPageHasRun = true;
}

window.initAppPage = initAppPage;

// Run route protection and access validation
checkAuth();

// Initialize the AJAX SPA router with page change callback
initRouter(initAppPage);

// Initial page bootstrap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppPage);
} else {
    initAppPage();
}
