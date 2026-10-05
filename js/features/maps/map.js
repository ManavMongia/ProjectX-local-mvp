/**
 * Map Feature Module
 * Interactive Leaflet map view for property listings with marker synchronization and sidebar cards.
 */

import { getListings, formatListingPrice, formatIntentLabel, calculateListingAge } from '../../services/listing-service.js';
import { searchLocation } from '../../services/location-service.js';
import { syncSavedListings } from '../../services/user-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { showToast } from '../../ui/toast.js';

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    
    let initialCenter = [19.0760, 72.8777]; // Mumbai Center
    let initialZoom = 13;

    if (latParam && lngParam) {
        initialCenter = [parseFloat(latParam), parseFloat(lngParam)];
        initialZoom = 15;
    }

    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    const map = L.map('map', {
        center: initialCenter,
        zoom: initialZoom,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0, 
        zoomControl: false
    });
    
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

    // Load Listings from Supabase
    const allListings = await getListings({ status: 'Active' });
    
    // Filter to those with coordinates
    const markersData = allListings.filter(l => l.lat !== null && l.lng !== null).map(l => {
        return { ...l, lat: parseFloat(l.lat), lng: parseFloat(l.lng) };
    });

    const withoutCoords = allListings.filter(l => l.lat === null || l.lng === null);

    const markers = [];
    let activeListingId = null;
    let isProgrammaticMove = false;
    let lastValidBounds = null;

    function selectListing(id, fromMap = false) {
        activeListingId = id;
        const markerObj = markers.find(m => m.data.id == id);
        
        if (!fromMap && markerObj) {
            isProgrammaticMove = true;
            map.flyTo([markerObj.data.lat, markerObj.data.lng], 15, { animate: true, duration: 0.5 });
            markerObj.marker.openPopup();
            setTimeout(() => { isProgrammaticMove = false; }, 600);
        }

        updateSidebar();
        
        // Reset all pins to default state
        document.querySelectorAll('.map-pin-wrapper').forEach(wrapper => {
            wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
            wrapper.style.zIndex = '';
        });

        // Activate selected pin
        const pinEl = document.getElementById(`pin-${id}`);
        if (pinEl) {
            pinEl.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
            pinEl.style.transform = 'translate(-50%, -50%) scale(1.12)';
            pinEl.style.zIndex = '1000';
        }

        if (fromMap) {
            setTimeout(() => {
                const cardEl = document.getElementById(`card-${id}`);
                if (cardEl) {
                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }

    markersData.forEach(p => {
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

        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        
        marker.bindPopup(`
            <div class="p-2 min-w-[150px]">
                <h4 class="font-bold text-sm text-slate-900">${formatListingPrice(p.price, p.intent)}</h4>
                <p class="text-xs font-medium text-slate-500 mt-0.5">${escHtml(p.title)}</p>
                <div class="flex items-center gap-2 mt-2 text-slate-600 text-[10px] font-bold">
                    <span>${p.beds} BEDS</span> &bull; <span>${p.baths} BATHS</span>
                </div>
                <button onclick="window.location.href='property-details.html?id=${p.id}'" class="mt-3 w-full bg-slate-900 text-white px-3 py-1.5 rounded text-[10px] uppercase font-bold hover:bg-slate-800 transition-colors">View Details</button>
            </div>
        `, { closeButton: false, offset: [0, -35] });

        marker.on('click', () => selectListing(p.id, true));
        markers.push({ marker, data: p });
    });

    const sidebarContainer = document.querySelector('.overflow-y-auto.p-6');
    const matchesCountEl = document.querySelector('#map-listings-count');

    window.toggleMapFavorite = async function(e, id) {
        e.stopPropagation();
        let saved = JSON.parse(localStorage.getItem('savedProperties') || '[]');
        if (saved.includes(id)) {
            saved = saved.filter(savedId => savedId != id);
            showToast('Removed from favorites');
        } else {
            saved.push(id);
            showToast('Added to favorites');
        }
        
        const user = await getCurrentUser();
        await syncSavedListings(user ? user.id : null, saved);
        updateSidebar();
    };

    window.clickSidebarCard = function(id) {
        selectListing(id, false);
    };

    function updateSidebar() {
        if (isProgrammaticMove) return;

        let bounds = map.getBounds();
        const mapPane = document.getElementById('map-pane');
        const mapHeight = mapPane ? mapPane.offsetHeight : 0;
        if (window.innerWidth < 768) {
            if (mapHeight > 150) {
                lastValidBounds = bounds;
            } else if (lastValidBounds) {
                bounds = lastValidBounds;
            }
        }

        const visibleListings = markersData.filter(p => bounds.contains([p.lat, p.lng]));
        
        if (matchesCountEl) {
            matchesCountEl.textContent = `${visibleListings.length} MATCHES FOUND`;
        }

        if (!sidebarContainer) return;

        if (visibleListings.length === 0) {
            sidebarContainer.innerHTML = '<p class="text-slate-500 text-center mt-10">No properties found in this area.</p>';
            return;
        }

        let saved = JSON.parse(localStorage.getItem('savedProperties') || '[]');

        sidebarContainer.innerHTML = visibleListings.map(l => {
            const isSaved = saved.includes(l.id);
            const isActive = activeListingId == l.id;
            const activeClasses = isActive ? 'ring-4 ring-slate-900 shadow-2xl scale-[1.02]' : 'border-slate-100 hover:shadow-xl';
            const age = calculateListingAge(l.created_at);
            
            return `
            <div id="card-${l.id}" class="listing-card cursor-pointer bg-white rounded-3xl border ${activeClasses} overflow-hidden transition-all duration-300" onclick="clickSidebarCard(${l.id})">
              <div class="aspect-[16/9] overflow-hidden relative bg-slate-100">
                <img loading="lazy" src="${l.img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" class="w-full h-full object-cover transition-transform duration-700 ${isActive ? '' : 'group-hover:scale-105'}">
                <div class="absolute top-4 left-4 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">${formatIntentLabel(l.intent)}</div>
              </div>
              <div class="p-5">
                <div class="flex justify-between items-start mb-1">
                  <h3 class="text-xl font-black text-slate-900">${formatListingPrice(l.price, l.intent, { html: true })}</h3>
                  <div class="flex items-center gap-2">
                    <button class="transition-colors text-slate-200 hover:text-red-500 flex items-center justify-center" onclick="event.stopPropagation(); window.openReportModal('listing', ${l.id}, '${escHtml(l.title)}');" title="Report Listing">
                      <span class="material-symbols-outlined text-[20px]">flag</span>
                    </button>
                    <button class="transition-colors ${isSaved ? 'text-red-500' : 'text-slate-200 hover:text-red-500'}" onclick="toggleMapFavorite(event, ${l.id})">
                      <span class="material-symbols-outlined text-[24px]" style="font-variation-settings: 'FILL' ${isSaved ? '1' : '0'};">favorite</span>
                    </button>
                  </div>
                </div>
                <p class="text-slate-500 text-sm font-medium mb-4 truncate">${escHtml(l.title)}, ${escHtml(l.location)}</p>
                <div class="flex flex-wrap items-center gap-y-2 gap-x-4 text-slate-400">
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
                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">schedule</span> Listed ${age.date}
                  </span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                    age.days <= 7 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : age.days <= 30 
                        ? 'bg-amber-50 text-amber-700' 
                        : 'bg-slate-50 text-slate-600'
                  }">${age.label}</span>
                </div>
              </div>
            </div>
            `;
        }).join('');

        document.querySelectorAll('.map-pin-wrapper').forEach(wrapper => {
            wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            wrapper.style.transform = 'translate(-50%, -50%) scale(1)';
            wrapper.style.zIndex = '';
        });
        if (activeListingId) {
            const pinEl = document.getElementById(`pin-${activeListingId}`);
            if (pinEl) {
                pinEl.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
                pinEl.style.transform = 'translate(-50%, -50%) scale(1.12)';
                pinEl.style.zIndex = '1000';
            }
        }
    }

    map.on('moveend', updateSidebar);
    setTimeout(updateSidebar, 100);

    // Geocode missing coordinates on the fly to support legacy listings
    withoutCoords.forEach((l, index) => {
        setTimeout(async () => {
            const data = await searchLocation(l.location, { countrycodes: 'IN', limit: 1 });
            if (data && data.length > 0) {
                const item = data[0];
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lon);
                
                const updatedListing = { ...l, lat, lng };
                markersData.push(updatedListing);
                
                const icon = L.divIcon({
                    className: 'bg-transparent border-none',
                    html: `
                      <div id="pin-${l.id}" class="map-pin-wrapper" style="
                        position: relative;
                        transform: translate(-50%, -50%);
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        background: white;
                        border: 2px solid ${l.intent === 'Rent' ? '#059669' : '#0f172a'};
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
                          background: ${l.intent === 'Rent' ? '#059669' : '#0f172a'};
                          border-radius: 50%;
                          flex-shrink: 0;
                          transition: all 0.2s ease;
                        "></div>
                        <span class="pin-label" style="
                          font-family: Outfit, sans-serif;
                          font-size: 12px;
                          font-weight: 800;
                          color: ${l.intent === 'Rent' ? '#059669' : '#0f172a'};
                          letter-spacing: 0.01em;
                        ">${formatMapPrice(l.price, l.intent)}</span>
                      </div>
                    `,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                });
                
                const marker = L.marker([lat, lng], { icon }).addTo(map);
                marker.bindPopup(`
                    <div class="p-2 min-w-[150px]">
                        <h4 class="font-bold text-sm text-slate-900">${formatListingPrice(l.price, l.intent)}</h4>
                        <p class="text-xs font-medium text-slate-500 mt-0.5">${escHtml(l.title)}</p>
                        <div class="flex items-center gap-2 mt-2 text-slate-600 text-[10px] font-bold">
                            <span>${l.beds} BEDS</span> &bull; <span>${l.baths} BATHS</span>
                        </div>
                        <button onclick="window.location.href='property-details.html?id=${l.id}'" class="mt-3 w-full bg-slate-900 text-white px-3 py-1.5 rounded text-[10px] uppercase font-bold hover:bg-slate-800 transition-colors">View Details</button>
                    </div>
                `, { closeButton: false, offset: [0, -35] });
                
                marker.on('click', () => selectListing(l.id, true));
                markers.push({ marker, data: updatedListing });
                updateSidebar();
            }
        }, index * 1000);
    });

    // Map Search
    const searchInput = document.getElementById('map-location-search');
    const searchBtn = document.getElementById('map-search-btn');
    const resultsContainer = document.getElementById('map-search-results');
    let debounceTimer;

    if (searchBtn && searchInput) {
        searchBtn.onclick = async () => {
            const val = searchInput.value.trim();
            if (val) {
                const data = await searchLocation(val, { countrycodes: 'IN', limit: 1 });
                if (data.length > 0) {
                    const item = data[0];
                    map.flyTo([item.lat, item.lon], 15, { animate: true, duration: 1 });
                    showToast(`Showing results near ${item.display_name.split(',')[0]}`);
                }
            }
        };
        searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchBtn.click(); };

        if (resultsContainer) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const query = e.target.value.trim();
                if (query.length < 3) { resultsContainer.classList.add('hidden'); return; }
                
                debounceTimer = setTimeout(async () => {
                    const data = await searchLocation(query, { countrycodes: 'IN', limit: 5 });
                    resultsContainer.innerHTML = '';
                    if (data.length === 0) {
                        resultsContainer.innerHTML = '<div class="p-4 text-sm text-slate-500 font-medium">No locations found.</div>';
                    } else {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center gap-3';
                            div.innerHTML = `<span class="material-symbols-outlined text-slate-400 text-[18px]">location_on</span><span class="text-xs font-medium text-slate-700 truncate" title="${item.display_name}">${item.display_name}</span>`;
                            div.onclick = () => {
                                searchInput.value = item.display_name.split(',')[0];
                                resultsContainer.classList.add('hidden');
                                map.flyTo([item.lat, item.lon], 15, { animate: true, duration: 1 });
                                showToast(`Showing results near ${item.display_name.split(',')[0]}`);
                            };
                            resultsContainer.appendChild(div);
                        });
                    }
                    resultsContainer.classList.remove('hidden');
                    resultsContainer.classList.add('flex');
                }, 300);
            });
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                    resultsContainer.classList.add('hidden');
                }
            });
        }
    }
}
