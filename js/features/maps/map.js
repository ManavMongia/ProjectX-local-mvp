/**
 * Map Feature Module
 * Unified Search Your Home Experience:
 * Combined Interactive Leaflet Map + Synchronized Side-List View with Full-Screen View Switching.
 */

import { 
    getListings, 
    formatListingPrice, 
    formatIntentLabel, 
    calculateListingAge, 
    isListingVerified, 
    renderListingVerificationBadge, 
    isListingSoldOut, 
    renderListingSoldOutBadge, 
    renderAvailabilityBadge, 
    renderListingAgeBadge 
} from '../../services/listing-service.js';
import { searchLocation } from '../../services/location-service.js';
import { syncSavedListings, getSavedListings } from '../../services/user-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { showToast } from '../../ui/toast.js';
import {
    initCentralizedFilters,
    getAppliedFilters,
    setAppliedFilters,
    openFiltersDrawer,
    clearAllFilters,
    DEFAULT_FILTERS
} from '../search/centralized-filters.js';
import { filterListingCard } from '../search/filters.js';
import {
    DEFAULT_CLUSTER_OPTIONS,
    createClusterIcon,
    filterListingsForClustering,
    getClusterListingIds,
    renderClusterFilterBanner
} from './map-clustering.js';

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function initBuyerMapPage() {
    function formatMapPrice(price, intent) {
        return formatListingPrice(price, intent);
    }

    if (typeof L === 'undefined') {
        console.error('Leaflet is not loaded!');
        return;
    }

    const indiaBounds = L.latLngBounds(
        L.latLng(6.5, 68.1), // Southwest
        L.latLng(35.6, 97.4)  // Northeast
    );

    const urlParams = new URLSearchParams(window.location.search);
    const latParam = urlParams.get('lat');
    const lngParam = urlParams.get('lng');
    const qParam = urlParams.get('q');
    const intentParam = urlParams.get('intent');
    const typeParam = urlParams.get('type');
    
    let initialCenter = [19.0760, 72.8777]; // Mumbai Center
    let initialZoom = 13;

    if (latParam && lngParam) {
        initialCenter = [parseFloat(latParam), parseFloat(lngParam)];
        initialZoom = 15;
    }

    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    // Destroy any prior map instance if re-initializing in SPA
    if (window._currentLeafletMap) {
        try {
            window._currentLeafletMap.remove();
        } catch {
            // Safe teardown
        }
    }

    const map = L.map('map', {
        center: initialCenter,
        zoom: initialZoom,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0, 
        zoomControl: false
    });
    window._currentLeafletMap = map;
    
    if (qParam) {
        setTimeout(() => {
            showToast(`Showing results near ${escHtml(qParam.split(',')[0])}`);
        }, 800);
    }
    
    map.setMinZoom(map.getBoundsZoom(indiaBounds));
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; ProjectX India',
        subdomains: 'abcd',
        maxZoom: 18,
        bounds: indiaBounds
    }).addTo(map);

    mapEl.style.background = '#ebebeb';

    // ── Load Listings from Supabase ──
    let rawListings = await getListings({ statuses: ['Active', 'sold_out'] });
    if (!rawListings || rawListings.length === 0) {
        rawListings = await getListings({ status: 'Active' });
    }
    const allListings = (rawListings || []).map(l => ({
        ...l,
        price: parseFloat(l.price) || 0,
        lat: l.lat !== null && l.lat !== undefined ? parseFloat(l.lat) : null,
        lng: l.lng !== null && l.lng !== undefined ? parseFloat(l.lng) : null
    }));

    // Identify listings with and without coordinates
    const withCoords = allListings.filter(l => l.lat !== null && l.lng !== null);
    const withoutCoords = allListings.filter(l => l.lat === null || l.lng === null);

    // Dynamic marker registry
    const markers = [];
    let activeListingId = null;
    let isProgrammaticMove = false;
    let currentQuery = (qParam || '').toLowerCase().trim();
    let currentSort = 'default';
    let currentViewMode = 'split'; // 'split' | 'map' | 'list'
    let selectedClusterListingIds = null;

    // Set initial filter state if URL params provided
    if (intentParam) {
        const applied = getAppliedFilters();
        applied.intent = intentParam;
        setAppliedFilters(applied);
    }
    if (typeParam) {
        const applied = getAppliedFilters();
        applied.selectedTypes = typeParam.split(',').map(s => s.trim());
        setAppliedFilters(applied);
    }

    // ── Marker Clustering Layer Group Initialization ──
    let markerClusterGroup = null;
    if (typeof L !== 'undefined' && typeof L.markerClusterGroup === 'function') {
        markerClusterGroup = L.markerClusterGroup({
            ...DEFAULT_CLUSTER_OPTIONS,
            iconCreateFunction: createClusterIcon
        });
        map.addLayer(markerClusterGroup);
    } else if (typeof L !== 'undefined') {
        markerClusterGroup = L.layerGroup();
        map.addLayer(markerClusterGroup);
    }

    // ── Build Leaflet Markers ──
    function createMarkerForListing(p) {
        const icon = L.divIcon({
            className: 'bg-transparent border-none',
            html: `
              <div id="pin-${p.id}" class="map-pin-wrapper" style="
                position: relative;
                transform: translate(-50%, -50%);
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: white;
                border: 2px solid ${p.intent === 'Rent' ? '#059669' : '#0f172a'};
                border-radius: 999px;
                padding: 4px 10px 4px 6px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.12);
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
              ">
                <div class="pin-dot" style="
                  width: 8px;
                  height: 8px;
                  background: ${p.intent === 'Rent' ? '#059669' : '#0f172a'};
                  border-radius: 50%;
                  flex-shrink: 0;
                  transition: all 0.2s ease;
                "></div>
                <span class="pin-label" style="
                  font-family: Outfit, sans-serif;
                  font-size: 12px;
                  font-weight: 800;
                  color: ${p.intent === 'Rent' ? '#059669' : '#0f172a'};
                  letter-spacing: 0.01em;
                ">${formatMapPrice(p.price, p.intent)}</span>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });

        const marker = L.marker([p.lat, p.lng], { icon });
        marker.listingId = p.id;
        marker.listingData = p;

        const popupAge = calculateListingAge(p.created_at);

        marker.bindPopup(`
            <div class="p-2 min-w-[170px] font-['Outfit']">
                <div class="flex items-center justify-between gap-1 mb-1">
                    <h4 class="font-bold text-sm text-slate-900">${formatListingPrice(p.price, p.intent)}</h4>
                    <div class="flex items-center gap-1">
                        ${renderListingSoldOutBadge(isListingSoldOut(p))}
                        ${renderListingVerificationBadge(isListingVerified(p))}
                    </div>
                </div>
                <p class="text-xs font-medium text-slate-500 mt-0.5 truncate">${escHtml(p.title)}</p>
                <div class="flex items-center gap-2 mt-2 text-slate-600 text-[10px] font-bold">
                    <span>${p.beds} BEDS</span> &bull; <span>${p.baths} BATHS</span>
                </div>
                <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span class="font-bold">Created on ${popupAge.date}</span>
                    ${renderListingAgeBadge(popupAge)}
                </div>
                <button onclick="window.location.href='property-details.html?id=${p.id}'" class="mt-3 w-full bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold hover:bg-slate-800 transition-colors">View Details</button>
            </div>
        `, { closeButton: false, offset: [0, -35] });

        marker.on('click', () => selectListing(p.id, true));
        const markerObj = { id: p.id, marker, data: p };
        markers.push(markerObj);
        return markerObj;
    }

    withCoords.forEach(p => createMarkerForListing(p));

    // Geocode missing coordinates on the fly for legacy database items
    withoutCoords.forEach((l, index) => {
        setTimeout(async () => {
            const data = await searchLocation(l.location, { countrycodes: 'IN', limit: 1 });
            if (data && data.length > 0) {
                const item = data[0];
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lon);
                l.lat = lat;
                l.lng = lng;
                createMarkerForListing(l);
                applyFiltersAndSync();
            }
        }, index * 1000);
    });

    // ── Cluster Click Interaction with Side-List Synchronization & Spiderfying ──
    if (markerClusterGroup && typeof markerClusterGroup.on === 'function') {
        markerClusterGroup.on('clusterclick', (a) => {
            const cluster = a.layer;
            const clusterIds = getClusterListingIds(cluster);
            if (!clusterIds || clusterIds.length === 0) return;

            // Activate cluster filter in side list
            selectedClusterListingIds = new Set(clusterIds);

            // If on mobile bottom sheet, snap to half so user can view cluster properties
            if (isMobile()) {
                setSheetHeight(SNAP_HALF, true);
            }

            // Re-render side list focusing on cluster listings
            renderSideList();

            const currentZoom = map.getZoom();
            const maxZoom = map.getMaxZoom() || 18;
            const bounds = cluster.getBounds();
            const isSameCoord = bounds.getNorthEast().equals(bounds.getSouthWest());

            // Smooth zoom to bounds or spiderfy at max zoom / identical coordinates
            if (currentZoom >= maxZoom || isSameCoord) {
                if (typeof cluster.spiderfy === 'function') {
                    cluster.spiderfy();
                }
            } else {
                if (typeof cluster.zoomToBounds === 'function') {
                    cluster.zoomToBounds({ padding: [40, 40] });
                } else {
                    map.fitBounds(bounds, { padding: [40, 40] });
                }
            }
        });
    }

    // Reset cluster selection when clicking blank map space
    map.on('click', () => {
        if (selectedClusterListingIds) {
            selectedClusterListingIds = null;
            renderSideList();
        }
    });

    // ── Bidirectional Selection ──
    function highlightPinAndCard(id, fromMap) {
        // Visual highlight on map pins
        document.querySelectorAll('.map-pin-wrapper').forEach(wrapper => {
            wrapper.classList.remove('active-pin');
            wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
            wrapper.style.zIndex = '';
        });

        const pinEl = document.getElementById(`pin-${id}`);
        if (pinEl) {
            pinEl.classList.add('active-pin');
            pinEl.style.boxShadow = '0 8px 24px rgba(15,23,42,0.3)';
            pinEl.style.transform = 'translate(-50%, -50%) scale(1.15)';
            pinEl.style.zIndex = '1000';
        }

        // If card was clicked from map, check if cluster filter is active and needs clearing
        if (fromMap && selectedClusterListingIds && !selectedClusterListingIds.has(id)) {
            selectedClusterListingIds = null;
            renderSideList();
        }

        // Visual highlight and scroll on side-list card
        document.querySelectorAll('.listing-card').forEach(card => {
            card.classList.remove('ring-4', 'ring-slate-900', 'shadow-2xl', 'scale-[1.01]');
            card.classList.add('border-slate-200');
        });

        const cardEl = document.getElementById(`card-${id}`);
        if (cardEl) {
            cardEl.classList.add('ring-4', 'ring-slate-900', 'shadow-2xl', 'scale-[1.01]');
            cardEl.classList.remove('border-slate-200');
            if (fromMap) {
                setTimeout(() => {
                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    function selectListing(id, fromMap = false) {
        activeListingId = id;
        const markerObj = markers.find(m => m.id == id);
        
        if (!fromMap && markerObj) {
            isProgrammaticMove = true;
            // If marker is inside a cluster, zoomToShowLayer smoothly reveals and opens it
            if (markerClusterGroup && typeof markerClusterGroup.zoomToShowLayer === 'function') {
                markerClusterGroup.zoomToShowLayer(markerObj.marker, () => {
                    markerObj.marker.openPopup();
                    highlightPinAndCard(id, fromMap);
                    isProgrammaticMove = false;
                });
            } else {
                map.flyTo([markerObj.data.lat, markerObj.data.lng], 15, { animate: true, duration: 0.5 });
                markerObj.marker.openPopup();
                highlightPinAndCard(id, fromMap);
                setTimeout(() => { isProgrammaticMove = false; }, 600);
            }
        } else {
            highlightPinAndCard(id, fromMap);
        }
    }

    window.clickSidebarCard = function(id) {
        selectListing(id, false);
    };

    window.selectListing = selectListing;

    // ── Favorite & Sharing Actions ──
    window.toggleMapFavorite = async function(e, id) {
        if (e) e.stopPropagation();
        let saved = JSON.parse(localStorage.getItem('savedProperties') || '[]');
        if (saved.includes(id)) {
            saved = saved.filter(savedId => savedId != id);
            showToast('Removed from favorites');
        } else {
            saved.push(id);
            showToast('Added to favorites');
        }
        localStorage.setItem('savedProperties', JSON.stringify(saved));
        
        const user = await getCurrentUser();
        await syncSavedListings(user ? user.id : null, saved);
        applyFiltersAndSync();
    };

    window.shareMapListing = function(e, id) {
        if (e) e.stopPropagation();
        const shareUrl = `${window.location.origin}/property-details.html?id=${id}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('Property link copied to clipboard!');
            }).catch(() => {
                showToast(shareUrl);
            });
        } else {
            showToast('Link: ' + shareUrl);
        }
    };

    // ── Filter Matching & Evaluation ──
    function matchesListingCriteria(listing, criteria) {
        const cardMock = {
            dataset: {
                id: String(listing.id),
                title: listing.title || '',
                location: listing.location || '',
                type: listing.type || '',
                beds: String(listing.beds || 0),
                baths: String(listing.baths || 0),
                price: String(listing.price || 0),
                sqft: String(listing.sqft || 0),
                intent: listing.intent || '',
                verified: isListingVerified(listing) ? 'true' : 'false',
                status: listing.status || 'Active',
                availableFrom: listing.available_from || '',
                createdAt: listing.created_at || '',
                date: listing.created_at || ''
            }
        };

        const combinedCriteria = {
            ...criteria,
            query: currentQuery || criteria.query || ''
        };

        return filterListingCard(cardMock, combinedCriteria);
    }

    function sortListingsData(list, sortVal) {
        const sorted = [...list];
        if (sortVal === 'price-low') {
            return sorted.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
        }
        if (sortVal === 'price-high') {
            return sorted.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
        }
        if (sortVal === 'newest') {
            return sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
        return sorted;
    }

    // ── Centralized Filtering and Synchronization Engine ──
    const sidebarContainer = document.getElementById('property-side-list') || document.querySelector('.list-scroll-area') || document.querySelector('.overflow-y-auto.p-6');
    const countText = document.getElementById('listings-count-text');
    const matchesCountEl = document.getElementById('map-listings-count');
    const toolbarCountEl = document.getElementById('map-listings-count-toolbar');

    let currentMatchingListings = [];

    function renderSideList() {
        if (!sidebarContainer) return;

        // Determine whether to display cluster-focused or all matching listings
        let displayedListings = currentMatchingListings;
        let isClusterFiltered = false;

        if (selectedClusterListingIds && selectedClusterListingIds.size > 0) {
            const clusterItems = currentMatchingListings.filter(l => selectedClusterListingIds.has(l.id));
            if (clusterItems.length > 0) {
                displayedListings = clusterItems;
                isClusterFiltered = true;
            } else {
                selectedClusterListingIds = null;
            }
        }

        const sortedListings = sortListingsData(displayedListings, currentSort);

        // Update count indicators
        const countMsg = isClusterFiltered
            ? `${sortedListings.length} ${sortedListings.length === 1 ? 'home' : 'homes'} in selected cluster`
            : `${currentMatchingListings.length} ${currentMatchingListings.length === 1 ? 'home' : 'homes'} found in Mumbai & Delhi`;
        if (countText) countText.textContent = countMsg;
        if (matchesCountEl) matchesCountEl.textContent = `${sortedListings.length} MATCHES FOUND`;
        if (toolbarCountEl) toolbarCountEl.textContent = `${sortedListings.length} homes`;

        if (sortedListings.length === 0) {
            sidebarContainer.innerHTML = `
              <div class="col-span-full py-12 px-6 text-center bg-white rounded-3xl border border-slate-200">
                <span class="material-symbols-outlined text-[44px] text-slate-300 mb-2">filter_alt_off</span>
                <h3 class="text-lg font-black text-slate-900 mb-1">No matching properties found</h3>
                <p class="text-xs text-slate-500 mb-4 max-w-xs mx-auto">Try clearing search filters or adjusting your price and type criteria.</p>
                <button type="button" id="map-clear-all-btn" class="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-colors shadow-sm cursor-pointer">
                  Clear All Filters
                </button>
              </div>
            `;
            document.getElementById('map-clear-all-btn')?.addEventListener('click', () => {
                clearAllFilters();
                const sInput = document.getElementById('listing-search-input') || document.getElementById('map-location-search');
                if (sInput) sInput.value = '';
                currentQuery = '';
                applyFiltersAndSync();
            });
            return;
        }

        let saved = JSON.parse(localStorage.getItem('savedProperties') || '[]');

        const bannerHtml = isClusterFiltered 
            ? renderClusterFilterBanner(sortedListings.length, currentMatchingListings.length) 
            : '';

        const cardsHtml = sortedListings.map(l => {
            const age = calculateListingAge(l.created_at);
            const isActive = activeListingId == l.id;
            const activeClasses = isActive ? 'ring-4 ring-slate-900 shadow-2xl scale-[1.01]' : 'border-slate-200 hover:shadow-xl';
            const isSaved = saved.includes(l.id);

            return `
            <div id="card-${l.id}" class="listing-card group cursor-pointer bg-white rounded-3xl border ${activeClasses} overflow-hidden transition-all duration-300" onclick="window.clickSidebarCard(${l.id})">
              <div class="aspect-[16/9] overflow-hidden relative bg-slate-100">
                <img loading="lazy" src="${l.img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" class="w-full h-full object-cover transition-transform duration-700 ${isActive ? '' : 'group-hover:scale-105'}">
                <div class="absolute top-4 left-4 flex items-center gap-1.5 z-10 flex-wrap">
                  <div class="bg-white/95 backdrop-blur px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">${formatIntentLabel(l.intent)}</div>
                  ${renderListingVerificationBadge(isListingVerified(l))}
                  ${renderListingSoldOutBadge(isListingSoldOut(l))}
                </div>
                ${renderAvailabilityBadge(l) ? `<div class="absolute bottom-3 left-4 z-10">${renderAvailabilityBadge(l)}</div>` : ''}
                <div class="absolute top-4 right-4 flex items-center gap-1.5 z-10">
                  <button aria-label="Share Property" title="Share Property" class="w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors" onclick="window.shareMapListing(event, ${l.id});">
                    <span class="material-symbols-outlined text-[18px]">share</span>
                  </button>
                  <button aria-label="Report Listing" title="Report Listing" class="w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors" onclick="event.stopPropagation(); window.openReportModal('listing', ${l.id}, '${escHtml(l.title)}');">
                    <span class="material-symbols-outlined text-[18px]">flag</span>
                  </button>
                  <button aria-label="Save Property" title="Save Property" class="w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow flex items-center justify-center ${isSaved ? 'text-red-500' : 'text-slate-400 hover:text-red-500'} transition-colors" onclick="window.toggleMapFavorite(event, ${l.id});">
                    <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' ${isSaved ? '1' : '0'};">favorite</span>
                  </button>
                </div>
              </div>
              <div class="p-5">
                <div class="flex justify-between items-center mb-1">
                  <h3 class="text-xl font-black text-slate-900">${formatListingPrice(l.price, l.intent, { html: true })}</h3>
                  ${renderListingVerificationBadge(isListingVerified(l))}
                </div>
                <p class="text-slate-500 text-sm font-medium mb-3 truncate">${escHtml(l.title)}, ${escHtml(l.location)}</p>
                <div class="flex flex-wrap items-center gap-y-2 gap-x-4 text-slate-400 mb-3">
                  <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[18px]">bed</span>
                    <span class="text-xs font-black text-slate-900">${l.beds}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[18px]">bathtub</span>
                    <span class="text-xs font-black text-slate-900">${l.baths}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[18px]">square_foot</span>
                    <span class="text-xs font-black text-slate-900">${(l.sqft || 0).toLocaleString()} <span class="font-normal text-slate-400">sqft</span></span>
                  </div>
                </div>
                <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">schedule</span> Created on ${age.date}
                  </span>
                  ${renderListingAgeBadge(age)}
                </div>
              </div>
            </div>
            `;
        }).join('');

        sidebarContainer.innerHTML = bannerHtml + cardsHtml;

        // Wire clear cluster filter button
        const clearClusterBtn = document.getElementById('clear-cluster-filter-btn');
        if (clearClusterBtn) {
            clearClusterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedClusterListingIds = null;
                renderSideList();
            });
        }

        if (activeListingId) {
            highlightPinAndCard(activeListingId, false);
        }
    }

    function applyFiltersAndSync() {
        const applied = getAppliedFilters();
        selectedClusterListingIds = null; // Reset cluster selection upon filter change

        // 1. Evaluate matching listings across all filters
        currentMatchingListings = allListings.filter(l => matchesListingCriteria(l, applied));

        // 2. Synchronize Leaflet marker cluster group
        if (markerClusterGroup) {
            markerClusterGroup.clearLayers();
            const validGeoListings = filterListingsForClustering(currentMatchingListings);
            const layersToAdd = [];
            validGeoListings.forEach(l => {
                const mObj = markers.find(m => m.id == l.id);
                if (mObj) {
                    layersToAdd.push(mObj.marker);
                }
            });

            if (typeof markerClusterGroup.addLayers === 'function') {
                markerClusterGroup.addLayers(layersToAdd);
            } else if (typeof markerClusterGroup.addLayer === 'function') {
                layersToAdd.forEach(m => markerClusterGroup.addLayer(m));
            }
        }

        // 3. Render side-list
        renderSideList();
    }

    // Initialize centralized filters with re-render callback
    initCentralizedFilters({
        onApply: () => {
            applyFiltersAndSync();
        }
    });

    // ── Search Input (Title, City, Neighborhood) & Autocomplete ──
    const searchInput = document.getElementById('listing-search-input') || document.getElementById('map-location-search');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const resultsContainer = document.getElementById('map-search-results');
    let debounceTimer;

    if (searchInput) {
        if (qParam) searchInput.value = qParam;

        const handleSearchInput = (e) => {
            currentQuery = e.target.value.toLowerCase().trim();
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('hidden', currentQuery.length === 0);
            }
            applyFiltersAndSync();

            // Geocoding suggestions if query >= 3 chars
            if (resultsContainer) {
                clearTimeout(debounceTimer);
                if (currentQuery.length < 3) {
                    resultsContainer.classList.add('hidden');
                    return;
                }
                debounceTimer = setTimeout(async () => {
                    const data = await searchLocation(currentQuery, { countrycodes: 'IN', limit: 4 });
                    resultsContainer.innerHTML = '';
                    if (data && data.length > 0) {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center gap-2.5';
                            div.innerHTML = `<span class="material-symbols-outlined text-slate-400 text-[18px]">location_on</span><span class="text-xs font-semibold text-slate-700 truncate" title="${item.display_name}">${item.display_name}</span>`;
                            div.onclick = () => {
                                searchInput.value = item.display_name.split(',')[0];
                                currentQuery = searchInput.value.toLowerCase().trim();
                                resultsContainer.classList.add('hidden');
                                map.flyTo([item.lat, item.lon], 15, { animate: true, duration: 1 });
                                showToast(`Showing results near ${item.display_name.split(',')[0]}`);
                                applyFiltersAndSync();
                            };
                            resultsContainer.appendChild(div);
                        });
                        resultsContainer.classList.remove('hidden');
                        resultsContainer.classList.add('flex');
                    } else {
                        resultsContainer.classList.add('hidden');
                    }
                }, 300);
            }
        };

        searchInput.addEventListener('input', handleSearchInput);
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                currentQuery = '';
                searchClearBtn.classList.add('hidden');
                if (resultsContainer) resultsContainer.classList.add('hidden');
                applyFiltersAndSync();
            });
        }

        const searchBtn = document.getElementById('find-homes-btn') || document.getElementById('map-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                applyFiltersAndSync();
            });
        }

        document.addEventListener('click', (e) => {
            if (resultsContainer && !searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.classList.add('hidden');
            }
        });
    }

    // ── Quick Intent Buttons ──
    document.querySelectorAll('.intent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.intent-btn').forEach(b => {
                b.classList.remove('bg-slate-900', 'text-white');
                b.classList.add('bg-slate-100', 'text-slate-500');
            });
            btn.classList.add('bg-slate-900', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-500');

            const intentVal = btn.dataset.intent === 'all' ? 'all' : btn.dataset.intent;
            const applied = getAppliedFilters();
            applied.intent = intentVal;
            setAppliedFilters(applied);
            applyFiltersAndSync();
        });
    });

    // ── Sorting Dropdown ──
    const sortDropdown = document.getElementById('sort-dropdown');
    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyFiltersAndSync();
        });
    }

    // ── View Switching Logic: Combined View, Full Map, Full List ──
    function setView(mode) {
        currentViewMode = mode;
        const mapPane = document.getElementById('map-pane');
        const listPane = document.getElementById('list-pane');
        const sideList = document.getElementById('property-side-list');

        ['split', 'map', 'list'].forEach(m => {
            const btn = document.getElementById(`toggle-${m}`);
            if (!btn) return;
            const isActive = (m === mode);
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('text-slate-500', !isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (window.innerWidth >= 768) {
            // Desktop view modes
            if (mode === 'split') {
                if (mapPane) {
                    mapPane.style.display = 'block';
                    mapPane.classList.remove('w-full');
                    mapPane.classList.add('flex-1');
                }
                if (listPane) {
                    listPane.style.display = 'flex';
                    listPane.classList.remove('w-full', 'max-w-none');
                    listPane.classList.add('md:w-[480px]', 'lg:w-[520px]');
                }
                if (sideList) {
                    sideList.classList.remove('full-list-grid');
                }
            } else if (mode === 'map') {
                if (listPane) {
                    listPane.style.display = 'none';
                }
                if (mapPane) {
                    mapPane.style.display = 'block';
                    mapPane.classList.remove('flex-1');
                    mapPane.classList.add('w-full');
                }
            } else if (mode === 'list') {
                if (mapPane) {
                    mapPane.style.display = 'none';
                }
                if (listPane) {
                    listPane.style.display = 'flex';
                    listPane.classList.remove('md:w-[480px]', 'lg:w-[520px]');
                    listPane.classList.add('w-full', 'max-w-none');
                }
                if (sideList) {
                    sideList.classList.add('full-list-grid');
                }
            }
        }

        // Trigger Leaflet map redraw on layout change
        if (map) {
            map.invalidateSize();
            setTimeout(() => {
                map.invalidateSize();
            }, 300);
        }
    }

    ['split', 'map', 'list'].forEach(mode => {
        const btn = document.getElementById(`toggle-${mode}`);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setView(mode);
            });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                setView(mode);
            });
        }
    });

    window.setMapViewMode = setView;

    // ── Mobile Bottom Sheet (Screen < 768px) ──
    const SNAP_PEEK = 80;
    const SNAP_HALF = Math.round(window.innerHeight * 0.52);
    const SNAP_FULL = window.innerHeight - 56;

    let currentSnap = SNAP_HALF;
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    function isMobile() { return window.innerWidth < 768; }

    function setSheetHeight(h, animate = true) {
        if (!isMobile()) return;
        const listPane = document.getElementById('list-pane');
        const mapPane = document.getElementById('map-pane');
        if (!listPane || !mapPane) return;

        const clamped = Math.max(SNAP_PEEK, Math.min(h, SNAP_FULL));
        listPane.style.transition = animate ? 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
        listPane.style.height = clamped + 'px';

        const mapH = Math.max(40, window.innerHeight - clamped - 56);
        mapPane.style.height = mapH + 'px';
        mapPane.style.display = '';

        if (animate) {
            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 320);
        }
    }

    function initBottomSheet() {
        if (!isMobile()) return;
        const handle = document.getElementById('drag-handle');
        const listPane = document.getElementById('list-pane');
        if (!handle || !listPane) return;

        setSheetHeight(SNAP_HALF, false);

        function startDrag(clientY) {
            isDragging = true;
            startY = clientY;
            startHeight = listPane.getBoundingClientRect().height;
            listPane.style.transition = 'none';
        }

        function doDrag(clientY) {
            if (!isDragging) return;
            const dy = startY - clientY;
            setSheetHeight(startHeight + dy, false);
        }

        function endDrag() {
            if (!isDragging) return;
            isDragging = false;
            const h = listPane.getBoundingClientRect().height;
            const snaps = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];
            const closest = snaps.reduce((a, b) => Math.abs(b - h) < Math.abs(a - h) ? b : a);
            currentSnap = closest;
            setSheetHeight(closest, true);

            if (closest === SNAP_FULL) setView('list');
            else if (closest === SNAP_PEEK) setView('map');
            else setView('split');
        }

        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            startDrag(e.clientY);
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            doDrag(e.clientY);
        });

        handle.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            endDrag();
            try { handle.releasePointerCapture(e.pointerId); } catch {}
        });

        handle.addEventListener('pointercancel', (e) => {
            if (!isDragging) return;
            endDrag();
        });
    }

    initBottomSheet();

    window.addEventListener('resize', () => {
        if (isMobile()) {
            setSheetHeight(currentSnap, false);
        } else {
            setView(currentViewMode);
        }
        if (map) map.invalidateSize();
    });

    // ── Initial Render ──
    applyFiltersAndSync();

    if (!isMobile()) {
        setView('split');
    }
}
