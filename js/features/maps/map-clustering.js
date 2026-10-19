/**
 * Smart Map Marker Clustering Module
 * Pure functions and cluster configuration for ProjectX discovery experience.
 * Compatible with Leaflet.markercluster and headless testing environments.
 */

export const CLUSTER_TIERS = {
    SMALL: { min: 2, max: 5, className: 'projectx-cluster-small', size: 44, label: 'Homes' },
    MEDIUM: { min: 6, max: 15, className: 'projectx-cluster-medium', size: 52, label: 'Homes' },
    LARGE: { min: 16, max: Infinity, className: 'projectx-cluster-large', size: 60, label: 'Homes' }
};

/**
 * Determines the cluster size tier based on listing count.
 *
 * @param {number} count - Exact number of eligible properties in cluster.
 * @returns {'small' | 'medium' | 'large'}
 */
export function getClusterTier(count) {
    const num = Number(count) || 0;
    if (num >= CLUSTER_TIERS.LARGE.min) return 'large';
    if (num >= CLUSTER_TIERS.MEDIUM.min) return 'medium';
    return 'small';
}

/**
 * Retrieves styling configuration for a given tier.
 *
 * @param {'small' | 'medium' | 'large'} tier
 * @returns {typeof CLUSTER_TIERS.SMALL}
 */
export function getTierConfig(tier) {
    if (tier === 'large') return CLUSTER_TIERS.LARGE;
    if (tier === 'medium') return CLUSTER_TIERS.MEDIUM;
    return CLUSTER_TIERS.SMALL;
}

/**
 * Generates high-contrast, accessible HTML for a circular cluster marker.
 *
 * @param {number} count - Exact number of properties.
 * @param {boolean} [isActive=false] - Whether this cluster is currently selected.
 * @returns {string} HTML markup.
 */
export function createClusterIconHtml(count, isActive = false) {
    const safeCount = Number(count) || 0;
    const tier = getClusterTier(safeCount);
    const config = getTierConfig(tier);
    const label = safeCount === 1 ? 'Property' : 'Properties';
    const subLabel = safeCount === 1 ? 'Home' : 'Homes';
    const activeClass = isActive ? 'active-cluster' : '';

    return `
      <div class="projectx-cluster ${config.className} ${activeClass}" 
           role="button" 
           tabindex="0"
           aria-label="${safeCount} ${label}" 
           title="${safeCount} ${label}">
        <span class="cluster-count">${safeCount}</span>
        <span class="cluster-sub">${subLabel}</span>
      </div>
    `.trim();
}

/**
 * Factory function for Leaflet L.divIcon using custom cluster styles.
 *
 * @param {Object} cluster - Leaflet MarkerCluster instance.
 * @returns {Object|null} L.divIcon instance or null if Leaflet is not present.
 */
export function createClusterIcon(cluster) {
    if (typeof L === 'undefined') return null;
    const count = cluster.getChildCount();
    const tier = getClusterTier(count);
    const config = getTierConfig(tier);

    return L.divIcon({
        html: createClusterIconHtml(count),
        className: 'bg-transparent border-none',
        iconSize: L.point(config.size, config.size),
        iconAnchor: L.point(config.size / 2, config.size / 2)
    });
}

/**
 * Default Leaflet MarkerClusterGroup configuration for ProjectX.
 */
export const DEFAULT_CLUSTER_OPTIONS = {
    maxClusterRadius: 55,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false, // Handled manually for smooth sync and max-zoom spiderfy
    spiderfyDistanceMultiplier: 1.3,
    spiderLegPolylineOptions: {
        weight: 2,
        color: '#0f172a',
        opacity: 0.6,
        dashArray: '4, 4'
    },
    animate: true,
    animateAddingMarkers: false,
    chunkedLoading: true
};

/**
 * Filters listings to only those with valid geographic coordinates.
 * Invalid coordinate listings must not contribute to cluster counts.
 *
 * @param {Array<Object>} listings
 * @returns {Array<Object>}
 */
export function filterListingsForClustering(listings) {
    if (!Array.isArray(listings)) return [];
    return listings.filter(l => {
        if (!l || typeof l !== 'object') return false;
        const lat = Number(l.lat);
        const lng = Number(l.lng);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });
}

/**
 * Extracts unique listing IDs from a cluster's child markers.
 *
 * @param {Object} cluster - Leaflet cluster instance.
 * @returns {Array<string|number>}
 */
export function getClusterListingIds(cluster) {
    if (!cluster) return [];
    if (typeof cluster.getAllChildMarkers !== 'function') return [];
    
    const markers = cluster.getAllChildMarkers();
    const ids = new Set();
    markers.forEach(m => {
        const id = m.listingId || (m.listingData && m.listingData.id);
        if (id !== undefined && id !== null) {
            ids.add(id);
        }
    });
    return Array.from(ids);
}

/**
 * Generates the cluster filter notification banner HTML for the side-list.
 *
 * @param {number} clusterCount - Number of listings in the selected cluster.
 * @param {number} totalMatches - Total number of filtered matching listings.
 * @returns {string}
 */
export function renderClusterFilterBanner(clusterCount, totalMatches) {
    const count = Number(clusterCount) || 0;
    const total = Number(totalMatches) || count;
    const propLabel = count === 1 ? 'property' : 'properties';

    return `
      <div id="cluster-filter-banner" class="mb-4 p-3.5 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-md transition-all">
        <div class="flex items-center gap-2.5">
          <span class="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30 shrink-0">
            ${count}
          </span>
          <div>
            <h4 class="text-xs font-bold leading-tight">Showing ${count} ${propLabel} in this area</h4>
            <p class="text-[10px] text-slate-400">Selected from map cluster</p>
          </div>
        </div>
        <button id="clear-cluster-filter-btn" type="button" class="px-2.5 py-1 text-[11px] font-bold bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors flex items-center gap-1 cursor-pointer shrink-0" aria-label="Show all properties">
          <span>Show All (${total})</span>
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      </div>
    `.trim();
}

/**
 * Pure clustering simulation helper for unit testing clustering algorithms.
 * Given a list of coordinates and a distance radius threshold, clusters nearby points.
 *
 * @param {Array<{id: string|number, lat: number, lng: number}>} points
 * @param {number} [radiusKm=2.0] - Proximity threshold in kilometers
 * @returns {Array<{clusterId: string, count: number, points: Array<Object>, isCluster: boolean}>}
 */
export function simulateProximityClustering(points, radiusKm = 2.0) {
    const valid = filterListingsForClustering(points);
    const visited = new Set();
    const clusters = [];

    function distanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    for (let i = 0; i < valid.length; i++) {
        if (visited.has(valid[i].id)) continue;

        const currentGroup = [valid[i]];
        visited.add(valid[i].id);

        for (let j = i + 1; j < valid.length; j++) {
            if (visited.has(valid[j].id)) continue;
            const dist = distanceKm(valid[i].lat, valid[i].lng, valid[j].lat, valid[j].lng);
            if (dist <= radiusKm) {
                currentGroup.push(valid[j]);
                visited.add(valid[j].id);
            }
        }

        clusters.push({
            clusterId: `cluster-${clusters.length + 1}`,
            count: currentGroup.length,
            points: currentGroup,
            isCluster: currentGroup.length > 1
        });
    }

    return clusters;
}
