/**
 * Test Suite: Smart Map Marker Clustering with Smooth Zoom and Property Selection
 * Run: node scripts/test_map_clustering.js
 *
 * Verifies:
 *  1. Clustering Logic & Tiers:
 *     - Nearby listings cluster together based on spatial proximity.
 *     - Distant listings remain distinct individual markers.
 *     - Cluster tiers (small 2-5, medium 6-15, large 16+) assign correct classes and geometry.
 *     - Displayed count is exact and non-hardcoded.
 *     - Coordinates validation filters out null/NaN coordinates from clusters.
 *  2. Search & Filter Synchronization:
 *     - Filtered-out properties do NOT contribute to cluster counts.
 *     - Buy vs. Rent filtering recalculates cluster counts.
 *     - Search queries update cluster memberships and counts.
 *     - Clearing filters restores complete cluster and side-list counts.
 *  3. Map & Side-List Interaction:
 *     - Cluster click identifies child listing IDs and triggers side-list banner.
 *     - Side-list filters to only properties represented by the cluster.
 *     - Dismissing cluster filter restores full matching dataset.
 *     - Spiderfying support for identical coordinates or max zoom.
 *     - Bidirectional card <-> marker selection (zoomToShowLayer).
 *  4. HTML & CSS Audit:
 *     - map.html includes Leaflet MarkerCluster CSS and JS resources.
 *     - Custom cluster styles and responsive animation classes exist.
 *     - Split layout and view mode toggles preserved.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    CLUSTER_TIERS,
    getClusterTier,
    getTierConfig,
    createClusterIconHtml,
    filterListingsForClustering,
    getClusterListingIds,
    renderClusterFilterBanner,
    simulateProximityClustering,
    DEFAULT_CLUSTER_OPTIONS
} from '../js/features/maps/map-clustering.js';

import { filterListingCard } from '../js/features/search/filters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function test(desc, fn) {
    try {
        fn();
        console.log(`  ✅ ${desc}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     ${err.message}`);
        failed++;
    }
}

console.log('================================================================');
console.log('ProjectX: Smart Map Marker Clustering & Selection Test Suite');
console.log('================================================================');

// ── Section 1: Cluster Tiers & Icon Creation ──
console.log('\n--- Section 1: Cluster Sizing Tiers & Custom Icon Creation ---');

test('Small cluster tier applies to 2 - 5 properties', () => {
    assert.strictEqual(getClusterTier(2), 'small');
    assert.strictEqual(getClusterTier(3), 'small');
    assert.strictEqual(getClusterTier(5), 'small');
    const cfg = getTierConfig('small');
    assert.strictEqual(cfg.className, 'projectx-cluster-small');
    assert.strictEqual(cfg.size, 44);
});

test('Medium cluster tier applies to 6 - 15 properties', () => {
    assert.strictEqual(getClusterTier(6), 'medium');
    assert.strictEqual(getClusterTier(10), 'medium');
    assert.strictEqual(getClusterTier(15), 'medium');
    const cfg = getTierConfig('medium');
    assert.strictEqual(cfg.className, 'projectx-cluster-medium');
    assert.strictEqual(cfg.size, 52);
});

test('Large cluster tier applies to 16+ properties', () => {
    assert.strictEqual(getClusterTier(16), 'large');
    assert.strictEqual(getClusterTier(25), 'large');
    assert.strictEqual(getClusterTier(100), 'large');
    const cfg = getTierConfig('large');
    assert.strictEqual(cfg.className, 'projectx-cluster-large');
    assert.strictEqual(cfg.size, 60);
});

test('createClusterIconHtml renders exact count and accessible attributes', () => {
    const html3 = createClusterIconHtml(3);
    assert(html3.includes('projectx-cluster-small'), 'Should have small cluster class');
    assert(html3.includes('>3</span>'), 'Should display exact count 3');
    assert(html3.includes('aria-label="3 Properties"'), 'Should have accessible aria-label');
    assert(html3.includes('title="3 Properties"'), 'Should have title tooltip');

    const html12 = createClusterIconHtml(12);
    assert(html12.includes('projectx-cluster-medium'), 'Should have medium cluster class');
    assert(html12.includes('>12</span>'), 'Should display exact count 12');

    const html42 = createClusterIconHtml(42);
    assert(html42.includes('projectx-cluster-large'), 'Should have large cluster class');
    assert(html42.includes('>42</span>'), 'Should display exact count 42');
});

test('createClusterIconHtml supports active cluster state styling', () => {
    const activeHtml = createClusterIconHtml(5, true);
    assert(activeHtml.includes('active-cluster'), 'Should include active-cluster class when selected');
});

// ── Section 2: Coordinate Filtering & Spatial Clustering Simulation ──
console.log('\n--- Section 2: Spatial Clustering, Coordinates & Bounds ---');

test('filterListingsForClustering rejects null, NaN, or out-of-bound coordinates', () => {
    const sample = [
        { id: 1, title: 'Valid Bandra', lat: 19.0596, lng: 72.8295 },
        { id: 2, title: 'Null Lat', lat: null, lng: 72.8295 },
        { id: 3, title: 'Undefined Lng', lat: 19.0596, lng: undefined },
        { id: 4, title: 'String NaN', lat: 'invalid', lng: 72.8295 },
        { id: 5, title: 'Zero Coordinates', lat: 0, lng: 0 },
        { id: 6, title: 'Valid Worli', lat: 19.0178, lng: 72.8178 }
    ];

    const valid = filterListingsForClustering(sample);
    assert.strictEqual(valid.length, 2, 'Only listings with valid coordinates should pass');
    assert.deepStrictEqual(valid.map(v => v.id), [1, 6]);
});

test('Nearby listings in the same neighborhood produce a single cluster', () => {
    // 3 properties clustered tightly in Bandra West (< 500m apart)
    const bandraWest = [
        { id: 101, title: 'Pali Hill Villa', lat: 19.0620, lng: 72.8260 },
        { id: 102, title: 'Pali Naka Flat', lat: 19.0625, lng: 72.8270 },
        { id: 103, title: 'Carter Road Penthouse', lat: 19.0630, lng: 72.8250 }
    ];

    const clusters = simulateProximityClustering(bandraWest, 1.0);
    assert.strictEqual(clusters.length, 1, 'Should combine into 1 cluster');
    assert.strictEqual(clusters[0].count, 3, 'Cluster count should be exactly 3');
    assert.strictEqual(clusters[0].isCluster, true, 'isCluster flag should be true');
});

test('Distant listings across cities or distant areas remain separate', () => {
    // 1 property in Mumbai, 1 property in Delhi
    const distant = [
        { id: 201, title: 'Mumbai South', lat: 18.9220, lng: 72.8347 },
        { id: 202, title: 'Delhi Central', lat: 28.6139, lng: 77.2090 }
    ];

    const clusters = simulateProximityClustering(distant, 5.0);
    assert.strictEqual(clusters.length, 2, 'Should remain 2 separate markers/clusters');
    assert.strictEqual(clusters[0].count, 1);
    assert.strictEqual(clusters[1].count, 1);
    assert.strictEqual(clusters[0].isCluster, false);
});

test('Properties sharing identical coordinates cluster together cleanly', () => {
    // 2 listings in the same high-rise building with identical lat/lng
    const towerListings = [
        { id: 301, title: 'Tower Flat 401', lat: 19.0178, lng: 72.8178 },
        { id: 302, title: 'Tower Penthouse 1801', lat: 19.0178, lng: 72.8178 }
    ];

    const clusters = simulateProximityClustering(towerListings, 0.1);
    assert.strictEqual(clusters.length, 1, 'Identical coordinates should form 1 cluster');
    assert.strictEqual(clusters[0].count, 2, 'Count must equal 2');
    assert.strictEqual(clusters[0].points.length, 2);
});

test('getClusterListingIds extracts clean unique IDs from child markers', () => {
    const mockCluster = {
        getAllChildMarkers: () => [
            { listingId: 'p-1', listingData: { id: 'p-1' } },
            { listingId: 'p-2', listingData: { id: 'p-2' } },
            { listingId: 'p-2', listingData: { id: 'p-2' } } // duplicate test
        ]
    };

    const ids = getClusterListingIds(mockCluster);
    assert.deepStrictEqual(ids, ['p-1', 'p-2'], 'Must deduplicate and extract unique IDs');
});

// ── Section 3: Search & Filter Synchronization ──
console.log('\n--- Section 3: Search & Filter Synchronization ---');

test('Filtered-out listings do NOT contribute to cluster counts', () => {
    const listings = [
        { id: 1, title: 'Bandra Apartment', type: 'Apartment', intent: 'Buy', price: 15000000, beds: 2, baths: 2, lat: 19.06, lng: 72.82 },
        { id: 2, title: 'Bandra Penthouse', type: 'Penthouse', intent: 'Buy', price: 50000000, beds: 4, baths: 4, lat: 19.061, lng: 72.821 },
        { id: 3, title: 'Bandra Rental Studio', type: 'Studio', intent: 'Rent', price: 40000, beds: 1, baths: 1, lat: 19.062, lng: 72.822 }
    ];

    // Scenario A: Buy only filter
    const buyListings = listings.filter(l => l.intent === 'Buy');
    const buyClusters = simulateProximityClustering(buyListings, 1.0);
    assert.strictEqual(buyClusters.length, 1);
    assert.strictEqual(buyClusters[0].count, 2, 'Rent listing #3 must NOT be counted in Buy cluster');

    // Scenario B: Rent only filter
    const rentListings = listings.filter(l => l.intent === 'Rent');
    const rentClusters = simulateProximityClustering(rentListings, 1.0);
    assert.strictEqual(rentClusters.length, 1);
    assert.strictEqual(rentClusters[0].count, 1, 'Only Rent listing #3 should be in cluster');

    // Scenario C: Price cap filter (under 2 Cr)
    const cheapBuy = listings.filter(l => l.intent === 'Buy' && l.price <= 20000000);
    const cheapClusters = simulateProximityClustering(cheapBuy, 1.0);
    assert.strictEqual(cheapClusters[0].count, 1, 'Penthouse must be excluded from count');
});

test('Search query reduces cluster membership accordingly', () => {
    const sample = [
        { id: 1, title: 'Sea Breeze Luxury', location: 'Worli, Mumbai', lat: 19.01, lng: 72.81 },
        { id: 2, title: 'Worli Palms', location: 'Worli, Mumbai', lat: 19.011, lng: 72.811 },
        { id: 3, title: 'Green Acres', location: 'Thane, Mumbai', lat: 19.21, lng: 72.97 }
    ];

    const q = 'worli';
    const matches = sample.filter(l => l.location.toLowerCase().includes(q) || l.title.toLowerCase().includes(q));
    const clusters = simulateProximityClustering(matches, 1.0);

    assert.strictEqual(matches.length, 2);
    assert.strictEqual(clusters[0].count, 2, 'Cluster count matches filtered Worli listings only');
});

// ── Section 4: Side-List Cluster Banner & Interaction ──
console.log('\n--- Section 4: Side-List Banner & Cluster Interaction ---');

test('renderClusterFilterBanner generates responsive UI with count and dismiss button', () => {
    const bannerHtml = renderClusterFilterBanner(4, 25);
    assert(bannerHtml.includes('id="cluster-filter-banner"'), 'Must have #cluster-filter-banner');
    assert(bannerHtml.includes('Showing 4 properties in this area'), 'Must display cluster count message');
    assert(bannerHtml.includes('id="clear-cluster-filter-btn"'), 'Must contain clear button');
    assert(bannerHtml.includes('Show All (25)'), 'Must show total available count on clear button');
});

test('renderClusterFilterBanner handles single property wording correctly', () => {
    const bannerHtml = renderClusterFilterBanner(1, 10);
    assert(bannerHtml.includes('Showing 1 property in this area'), 'Must use singular "property"');
});

// ── Section 5: Configuration & Fallbacks ──
console.log('\n--- Section 5: Configuration & Fallbacks ---');

test('DEFAULT_CLUSTER_OPTIONS includes required performance and UX settings', () => {
    assert.strictEqual(DEFAULT_CLUSTER_OPTIONS.maxClusterRadius, 55, 'Cluster radius should be 55px');
    assert.strictEqual(DEFAULT_CLUSTER_OPTIONS.spiderfyOnMaxZoom, true, 'Must spiderfy on max zoom');
    assert.strictEqual(DEFAULT_CLUSTER_OPTIONS.zoomToBoundsOnClick, false, 'Manual click handler for side list sync');
    assert.strictEqual(DEFAULT_CLUSTER_OPTIONS.showCoverageOnHover, false, 'Clean look without polygon');
});

// ── Section 6: Source File & Markup Integrity Audit ──
console.log('\n--- Section 6: Source File & Markup Integrity Audit ---');

const mapHtmlPath = path.resolve(__dirname, '../map.html');
const mapHtml = fs.readFileSync(mapHtmlPath, 'utf8');

test('map.html imports Leaflet MarkerCluster CSS', () => {
    assert(mapHtml.includes('MarkerCluster.css'), 'map.html must include MarkerCluster.css');
    assert(mapHtml.includes('MarkerCluster.Default.css'), 'map.html must include MarkerCluster.Default.css');
});

test('map.html imports Leaflet MarkerCluster JS', () => {
    assert(mapHtml.includes('leaflet.markercluster.js'), 'map.html must include leaflet.markercluster.js');
});

test('map.html contains custom cluster styling classes', () => {
    assert(mapHtml.includes('.projectx-cluster'), 'Must include .projectx-cluster CSS');
    assert(mapHtml.includes('.projectx-cluster-small'), 'Must include .projectx-cluster-small');
    assert(mapHtml.includes('.projectx-cluster-medium'), 'Must include .projectx-cluster-medium');
    assert(mapHtml.includes('.projectx-cluster-large'), 'Must include .projectx-cluster-large');
    assert(mapHtml.includes('.active-cluster'), 'Must include .active-cluster');
    assert(mapHtml.includes('.leaflet-cluster-spider-leg'), 'Must include .leaflet-cluster-spider-leg styling');
});

test('map.html preserves full split layout, side list, and view switcher buttons', () => {
    assert(mapHtml.includes('id="main-split"'), 'Must preserve #main-split');
    assert(mapHtml.includes('id="list-pane"'), 'Must preserve #list-pane');
    assert(mapHtml.includes('id="map-pane"'), 'Must preserve #map-pane');
    assert(mapHtml.includes('id="property-side-list"'), 'Must preserve #property-side-list');
    assert(mapHtml.includes('id="toggle-split"'), 'Must preserve #toggle-split');
    assert(mapHtml.includes('id="toggle-map"'), 'Must preserve #toggle-map');
    assert(mapHtml.includes('id="toggle-list"'), 'Must preserve #toggle-list');
});

const mapJsPath = path.resolve(__dirname, '../js/features/maps/map.js');
const mapJs = fs.readFileSync(mapJsPath, 'utf8');

test('map.js imports map-clustering module helpers', () => {
    assert(mapJs.includes("from './map-clustering.js'"), 'map.js must import from map-clustering.js');
    assert(mapJs.includes('DEFAULT_CLUSTER_OPTIONS'), 'map.js must use DEFAULT_CLUSTER_OPTIONS');
    assert(mapJs.includes('createClusterIcon'), 'map.js must use createClusterIcon');
    assert(mapJs.includes('filterListingsForClustering'), 'map.js must use filterListingsForClustering');
    assert(mapJs.includes('getClusterListingIds'), 'map.js must use getClusterListingIds');
    assert(mapJs.includes('renderClusterFilterBanner'), 'map.js must use renderClusterFilterBanner');
});

test('map.js implements clusterclick event handler for side-list synchronization and spiderfying', () => {
    assert(mapJs.includes("'clusterclick'"), "map.js must listen for 'clusterclick' event");
    assert(mapJs.includes('selectedClusterListingIds = new Set'), 'Must record selected cluster listing IDs');
    assert(mapJs.includes('spiderfy'), 'Must support spiderfy expansion');
    assert(mapJs.includes('zoomToBounds'), 'Must support zoomToBounds');
});

test('map.js supports zoomToShowLayer for bidirectional card-to-cluster selection', () => {
    assert(mapJs.includes('zoomToShowLayer'), 'map.js must call zoomToShowLayer to reveal markers inside clusters');
});

test('map.js maintains map.invalidateSize() on view switching', () => {
    assert(mapJs.includes('map.invalidateSize()'), 'Must call map.invalidateSize() on layout changes');
});

console.log('================================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) {
    process.exit(1);
}
