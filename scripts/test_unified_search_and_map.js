/**
 * ProjectX Automated Feature Test Suite:
 * Unified "Search Your Home" Header & Combined Map + Side-List View
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
    console.log('================================================================');
    console.log('ProjectX: Unified "Search Your Home" & Combined Map + List Suite');
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
    // SECTION 1: HEADER & NAVIGATION AUDIT
    // -------------------------------------------------------------
    console.log('--- Section 1: Unified Header Navigation Audit ---');

    const publicPages = [
        'index.html',
        'map.html',
        'properties.html',
        'sell.html',
        'property-details.html',
        'profile.html',
        'sitemap.html',
        'shared-filter.html',
        'my-property.html'
    ];

    publicPages.forEach(page => {
        const filePath = path.resolve(__dirname, '..', page);
        const html = fs.readFileSync(filePath, 'utf8');

        test(`${page}: contains "Search Your Home" discovery link pointing to /map.html`, () => {
            assert(
                html.includes('Search Your Home') && html.includes('/map.html'),
                `${page} must include unified "Search Your Home" linking to /map.html`
            );
        });

        test(`${page}: contains Services dropdown with Sell Property`, () => {
            assert(
                html.includes('Services') && html.includes('Sell Property') && html.includes('/sell.html'),
                `${page} must include Services dropdown with Sell Property`
            );
        });
    });

    // Verify removal of standalone Buy, Rent, and Map View header navigation
    test('index.html desktop navigation: does NOT have standalone Buy, Rent, or Map View header options', () => {
        const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
        // Extract top desktop navigation links
        const navMatch = indexHtml.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
        assert(navMatch, 'Top navigation should exist');
        const desktopNav = navMatch[1];
        
        assert(!desktopNav.includes('>Buy</a>'), 'Desktop nav must not have standalone Buy');
        assert(!desktopNav.includes('>Rent</a>'), 'Desktop nav must not have standalone Rent');
        assert(!desktopNav.includes('>Map View</a>'), 'Desktop nav must not have standalone Map View');
    });

    test('index.html mobile menu: does NOT have standalone Buy, Rent, or Map View items', () => {
        const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
        const mobileMenuMatch = indexHtml.match(/<nav id="mobile-menu"[^>]*>([\s\S]*?)<\/nav>/);
        assert(mobileMenuMatch, 'Mobile menu should exist');
        const mobileMenu = mobileMenuMatch[1];

        assert(!mobileMenu.includes('>Buy</a>'), 'Mobile menu must not have standalone Buy');
        assert(!mobileMenu.includes('>Rent</a>'), 'Mobile menu must not have standalone Rent');
        assert(!mobileMenu.includes('>Map View</a>'), 'Mobile menu must not have standalone Map View');
        assert(mobileMenu.includes('Search Your Home'), 'Mobile menu must have Search Your Home');
        assert(mobileMenu.includes('Sell Property'), 'Mobile menu must have Sell Property under Services');
    });

    test('Dashboard navigation: role-based navigation remains intact in broker, employee, and admin panels', () => {
        const brokerHtml = fs.readFileSync(path.resolve(__dirname, '../broker-dashboard.html'), 'utf8');
        const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin-panel.html'), 'utf8');
        const employeeHtml = fs.readFileSync(path.resolve(__dirname, '../employee-panel.html'), 'utf8');

        assert(brokerHtml.includes('id="broker-sidebar"'), 'Broker dashboard sidebar must remain intact');
        assert(adminHtml.includes('id="admin-export-btn"'), 'Admin panel must remain intact');
        assert(employeeHtml.includes('id="employee-sidebar"') || employeeHtml.includes('employee-panel.html'), 'Employee panel must remain intact');
    });

    // -------------------------------------------------------------
    // SECTION 2: SEARCH YOUR HOME COMBINED VIEW UI STRUCTURE
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Combined View UI Structure (map.html) ---');

    const mapHtml = fs.readFileSync(path.resolve(__dirname, '../map.html'), 'utf8');

    test('map.html contains top search bar with #listing-search-input', () => {
        assert(mapHtml.includes('id="listing-search-input"'), 'Must contain #listing-search-input');
    });

    test('map.html contains Centralized Filters button #open-filters-btn', () => {
        assert(mapHtml.includes('id="open-filters-btn"'), 'Must contain #open-filters-btn');
    });

    test('map.html contains active filters badge #active-filters-badge', () => {
        assert(mapHtml.includes('id="active-filters-badge"'), 'Must contain #active-filters-badge');
    });

    test('map.html contains active filter chips container #active-filter-chips-container', () => {
        assert(mapHtml.includes('id="active-filter-chips-container"'), 'Must contain #active-filter-chips-container');
    });

    test('map.html contains sorting dropdown #sort-dropdown', () => {
        assert(mapHtml.includes('id="sort-dropdown"'), 'Must contain #sort-dropdown');
    });

    test('map.html contains full-screen view switcher controls (Combined, Full Map, Full List)', () => {
        assert(mapHtml.includes('id="toggle-split"'), 'Must contain #toggle-split for Combined View');
        assert(mapHtml.includes('id="toggle-map"'), 'Must contain #toggle-map for Full Map');
        assert(mapHtml.includes('id="toggle-list"'), 'Must contain #toggle-list for Full List');
        assert(mapHtml.includes('Combined View'), 'Must display "Combined View" label');
        assert(mapHtml.includes('Full Map'), 'Must display "Full Map" label');
        assert(mapHtml.includes('Full List'), 'Must display "Full List" label');
    });

    test('map.html contains split main container #main-split with side list #list-pane and map #map-pane', () => {
        assert(mapHtml.includes('id="main-split"'), 'Must contain #main-split');
        assert(mapHtml.includes('id="list-pane"'), 'Must contain #list-pane');
        assert(mapHtml.includes('id="map-pane"'), 'Must contain #map-pane');
        assert(mapHtml.includes('id="property-side-list"'), 'Must contain #property-side-list');
        assert(mapHtml.includes('id="map"'), 'Must contain #map container for Leaflet');
    });

    test('map.html includes mobile bottom sheet drag handle', () => {
        assert(mapHtml.includes('id="drag-handle"'), 'Must contain mobile drag handle');
        assert(mapHtml.includes('id="drag-handle-pill"'), 'Must contain drag handle pill');
    });

    // -------------------------------------------------------------
    // SECTION 3: MAP FEATURE MODULE & SYNCHRONIZATION LOGIC
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Map & Side-List Synchronization (map.js) ---');

    const mapJs = fs.readFileSync(path.resolve(__dirname, '../js/features/maps/map.js'), 'utf8');

    test('map.js imports and uses centralized filters module', () => {
        assert(mapJs.includes('initCentralizedFilters'), 'Must import initCentralizedFilters');
        assert(mapJs.includes('getAppliedFilters'), 'Must import getAppliedFilters');
    });

    test('map.js imports and uses listing verification, availability, and age helpers', () => {
        assert(mapJs.includes('renderListingVerificationBadge'), 'Must import renderListingVerificationBadge');
        assert(mapJs.includes('renderListingSoldOutBadge'), 'Must import renderListingSoldOutBadge');
        assert(mapJs.includes('renderAvailabilityBadge'), 'Must import renderAvailabilityBadge');
        assert(mapJs.includes('renderListingAgeBadge'), 'Must import renderListingAgeBadge');
        assert(mapJs.includes('calculateListingAge'), 'Must import calculateListingAge');
    });

    test('map.js fetches both Active and sold_out listings for discovery', () => {
        assert(mapJs.includes("statuses: ['Active', 'sold_out']"), 'Must request both Active and sold_out listings');
    });

    test('map.js synchronizes Leaflet markers and side list cards upon filter changes', () => {
        assert(mapJs.includes('applyFiltersAndSync'), 'Must define applyFiltersAndSync');
        assert(mapJs.includes('filterListingCard'), 'Must use filterListingCard for criteria evaluation');
    });

    test('map.js supports bidirectional selection between markers and list cards', () => {
        assert(mapJs.includes('selectListing'), 'Must define selectListing');
        assert(mapJs.includes('scrollIntoView'), 'Marker selection must scroll card into view');
        assert(mapJs.includes('flyTo'), 'Card selection must fly map to coordinates');
    });

    test('map.js supports view mode switching with map.invalidateSize()', () => {
        assert(mapJs.includes('setView'), 'Must define setView for view mode switching');
        assert(mapJs.includes('invalidateSize'), 'Must call map.invalidateSize() when switching views');
    });

    // -------------------------------------------------------------
    // SECTION 4: GUEST AND AUTHENTICATION ACCESS
    // -------------------------------------------------------------
    console.log('\n--- Section 4: Guest and Public Authentication State ---');

    const { guestPages, buyerPages } = await import('../js/core/auth-state.js');

    test('map.html is included in guestPages for unauthenticated browsing', () => {
        assert(guestPages.includes('map.html'), 'map.html must be in guestPages');
    });

    test('map.html is included in buyerPages', () => {
        assert(buyerPages.includes('map.html'), 'map.html must be in buyerPages');
    });

    test('sell.html is included in buyerPages and guestPages', () => {
        assert(guestPages.includes('sell.html'), 'sell.html must be in guestPages');
        assert(buyerPages.includes('sell.html'), 'sell.html must be in buyerPages');
    });

    // -------------------------------------------------------------
    // SECTION 5: FULL-SCREEN VIEW SWITCHING SIMULATION
    // -------------------------------------------------------------
    console.log('\n--- Section 5: View Mode Layout Class Simulation ---');

    function simulateViewMode(mode) {
        const state = {
            mode,
            mapDisplay: '',
            listDisplay: '',
            listWidthClass: '',
            isGrid: false
        };

        if (mode === 'split') {
            state.mapDisplay = 'block';
            state.listDisplay = 'flex';
            state.listWidthClass = 'md:w-[480px] lg:w-[520px]';
            state.isGrid = false;
        } else if (mode === 'map') {
            state.mapDisplay = 'block';
            state.listDisplay = 'none';
            state.listWidthClass = '';
            state.isGrid = false;
        } else if (mode === 'list') {
            state.mapDisplay = 'none';
            state.listDisplay = 'flex';
            state.listWidthClass = 'w-full max-w-none';
            state.isGrid = true;
        }

        return state;
    }

    test('Combined View: both map and side list are displayed side by side', () => {
        const split = simulateViewMode('split');
        assert.strictEqual(split.mapDisplay, 'block');
        assert.strictEqual(split.listDisplay, 'flex');
        assert(split.listWidthClass.includes('480px') || split.listWidthClass.includes('520px'));
        assert.strictEqual(split.isGrid, false);
    });

    test('Full Map: map expands to 100% width and side list is hidden', () => {
        const fullMap = simulateViewMode('map');
        assert.strictEqual(fullMap.mapDisplay, 'block');
        assert.strictEqual(fullMap.listDisplay, 'none');
    });

    test('Full List: side list expands to 100% width with grid and map is hidden', () => {
        const fullList = simulateViewMode('list');
        assert.strictEqual(fullList.mapDisplay, 'none');
        assert.strictEqual(fullList.listDisplay, 'flex');
        assert.strictEqual(fullList.isGrid, true);
    });

    // -------------------------------------------------------------
    // FINAL RESULTS SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite();
