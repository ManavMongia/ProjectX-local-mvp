/**
 * Custom Filters Feature
 * Saved search filters, custom client link generation, and geospatial filtering.
 */

import { supabase } from '../../core/supabase-client.js';
import { escHtml } from '../../core/app-state.js';
import { formatIntentLabel, formatListingPriceRange } from '../../services/listing-service.js';
import { showToast } from '../../ui/toast.js';
import {
    wireUseCurrentLocationButton,
    wireLocationMapToggleButton,
    syncLocationMapView,
    updateLocationPickerFields,
    initLeafletPickerMap
} from '../maps/location-search.js';

let editFilterId = null;

function updateModalLocationCoordinates(lat, lng, doGeocode = false) {
    updateLocationPickerFields({
        lat,
        lng,
        latInputId: 'filter-center-lat',
        lngInputId: 'filter-center-lng',
        labelInputId: 'filter-center-label',
        doGeocode
    });
}

function initModalLeafletMap(lat, lng) {
    initLeafletPickerMap('filter-modal-map', lat, lng, (newLat, newLng, doGeocode) => {
        updateModalLocationCoordinates(newLat, newLng, doGeocode);
    });
}

export function updateFilterPriceLabels() {
    const intent = document.getElementById('filter-intent')?.value || 'Any';
    const minLabel = document.getElementById('filter-price-min-label');
    const maxLabel = document.getElementById('filter-price-max-label');
    const labelText = intent === 'Buy' ? 'PRICE MIN (Cr (₹))' : 'PRICE MIN (/mo (₹))';
    const labelTextMax = intent === 'Buy' ? 'PRICE MAX (Cr (₹))' : 'PRICE MAX (/mo (₹))';
    if (minLabel) minLabel.textContent = labelText;
    if (maxLabel) maxLabel.textContent = labelTextMax;
}

export async function initCustomFiltersManager() {
    await renderCustomFilters();
    injectCustomFilterModal();
}

export async function renderCustomFilters() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const tbody = document.getElementById('custom-filters-tbody');
    if (!tbody) return;

    const { data: filters, error } = await supabase
        .from('custom_filters')
        .select('*')
        .eq('broker_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching custom filters:', error);
        tbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-slate-400">Error loading custom filters.</td></tr>';
        return;
    }

    if (!filters || filters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-slate-400 font-medium">No custom filters saved. Create one to share tailored lists with clients.</td></tr>';
        return;
    }

    tbody.innerHTML = filters.map(f => {
        const crit = f.criteria || {};
        const parts = [];
        if (crit.centerLabel) {
            const radStr = crit.radius ? ` (${crit.radius >= 1000 ? (crit.radius/1000).toFixed(1) + 'km' : crit.radius + 'm'})` : '';
            parts.push(`Near: ${escHtml(crit.centerLabel)}${radStr}`);
        }
        if (crit.type && crit.type !== 'Any') parts.push(`Type: ${crit.type}`);
        if (crit.intent && crit.intent !== 'Any') parts.push(`Intent: ${formatIntentLabel(crit.intent)}`);
        
        if (crit.bedsMin || crit.bedsMax) {
            const minB = crit.bedsMin || '1';
            const maxB = crit.bedsMax || '5+';
            parts.push(`Beds: ${minB}-${maxB}`);
        }
        if (crit.priceMin || crit.priceMax) {
            const priceIntent = crit.priceUnit === 'crore' || crit.intent === 'Buy' ? 'Buy' : 'Rent';
            parts.push(`Price: ${formatListingPriceRange(crit.priceMin, crit.priceMax, priceIntent)}`);
        }
        if (crit.sqftMin || crit.sqftMax) {
            const minS = crit.sqftMin ? `${crit.sqftMin}` : '0';
            const maxS = crit.sqftMax ? `${crit.sqftMax}` : '∞';
            parts.push(`Area: ${minS}-${maxS}sqft`);
        }

        const criteriaStr = parts.join(' | ') || 'All Active Inventory';
        const visibilityBadge = f.is_public !== false 
            ? '<span class="ml-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 rounded border border-emerald-200">Public</span>'
            : '<span class="ml-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 rounded border border-amber-200">Private</span>';

        return `
        <tr class="border-b border-surface-variant hover:bg-surface-container transition-colors" data-filter-id="${f.id}">
          <td class="p-4 font-semibold text-primary">
            <div class="flex items-center">
              ${escHtml(f.name)}
              ${visibilityBadge}
            </div>
          </td>
          <td class="p-4 text-on-surface-variant text-xs">${criteriaStr}</td>
          <td class="p-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="openCustomFilterModal(${f.id})" class="p-1.5 text-on-surface-variant hover:text-primary rounded hover:bg-surface-container" title="Edit Filter">
                <span class="material-symbols-outlined text-[20px]">edit</span>
              </button>
              <button onclick="copyShareLink(${f.id})" class="p-1.5 text-on-surface-variant hover:text-primary rounded hover:bg-surface-container" title="Copy Shareable Link">
                <span class="material-symbols-outlined text-[20px]">content_copy</span>
              </button>
              <button onclick="testCustomFilter(${f.id})" class="p-1.5 text-on-surface-variant hover:text-primary rounded hover:bg-surface-container" title="Test Filter">
                <span class="material-symbols-outlined text-[20px]">open_in_new</span>
              </button>
              <button onclick="deleteCustomFilter(${f.id})" class="p-1.5 text-on-surface-variant hover:text-error rounded hover:bg-error-container" title="Delete">
                <span class="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>
          </td>
        </tr>
        `;
    }).join('');
}

export function injectCustomFilterModal() {
    if (document.getElementById('custom-filter-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'custom-filter-modal';
    modal.className = 'hidden fixed inset-0 z-[100] items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-outline-variant flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low shrink-0">
          <h3 id="filter-modal-title" class="font-h3 text-h3 text-primary">Create Custom Filter</h3>
          <button onclick="closeCustomFilterModal()" class="text-slate-400 hover:text-slate-700 transition-colors">
            <span class="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
        
        <!-- Scrollable Form Content -->
        <div class="p-6 space-y-5 overflow-y-auto flex-1">
          <!-- Filter Name -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Filter Name *</label>
            <input id="filter-name" type="text" placeholder="e.g. Bandra West Curated Properties" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
          </div>

          <!-- Type & Intent -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Property Type</label>
              <select id="filter-type" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="Any">Any</option>
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Penthouse">Penthouse</option>
                <option value="Office">Office</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Intent</label>
              <select id="filter-intent" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="Any">Any</option>
                <option value="Rent">Rent</option>
                <option value="Buy">Sell</option>
              </select>
            </div>
          </div>

          <!-- Bedrooms Min / Max -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bedrooms Min</label>
              <select id="filter-beds-min" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="">Any</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bedrooms Max</label>
              <select id="filter-beds-max" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="">Any</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5+">5+</option>
              </select>
            </div>
          </div>

          <!-- Price Min / Max -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label id="filter-price-min-label" class="block text-xs font-semibold text-slate-500 tracking-wider mb-1">PRICE MIN (/mo (₹))</label>
              <input id="filter-price-min" type="number" step="1" placeholder="Min Price" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
            </div>
            <div>
              <label id="filter-price-max-label" class="block text-xs font-semibold text-slate-500 tracking-wider mb-1">PRICE MAX (/mo (₹))</label>
              <input id="filter-price-max" type="number" step="1" placeholder="Max Price" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
            </div>
          </div>

          <!-- Sqft Min / Max -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Area Min (sqft)</label>
              <input id="filter-sqft-min" type="number" step="50" placeholder="Min Area" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Area Max (sqft)</label>
              <input id="filter-sqft-max" type="number" step="50" placeholder="Max Area" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
            </div>
          </div>

          <!-- Geospatial Location curation -->
          <div class="border-t border-slate-100 pt-4 space-y-4">
            <div class="relative">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Location Center *</label>
              <input id="filter-center-label" type="text" placeholder="Search address or neighborhood..." class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
              <div id="filter-location-results" class="absolute left-0 right-0 z-[1050] bg-white rounded-xl shadow-lg border border-slate-200 mt-1 hidden flex-col max-h-48 overflow-y-auto"></div>
            </div>

            <!-- Latitude & Longitude displays -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <input id="filter-center-lat" type="hidden" readonly placeholder="Auto geocoded lat" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed outline-none"/>
              </div>
              <div>
                <input id="filter-center-lng" type="hidden" readonly placeholder="Auto geocoded lng" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed outline-none"/>
              </div>
            </div>

            <!-- Quick Geolocation buttons -->
            <div class="flex gap-3">
              <button id="filter-use-location-btn" class="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">my_location</span>
                Use Current Location
              </button>
              <button id="filter-toggle-map-btn" class="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">map</span>
                Choose on Map
              </button>
            </div>

            <!-- Leaflet Map Wrapper -->
            <div id="filter-modal-map" class="hidden"></div>

            <!-- Radius slider -->
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Search Radius</label>
                <span id="filter-radius-val" class="text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">1.0 km</span>
              </div>
              <input id="filter-radius" type="range" min="250" max="10000" step="250" value="1000" class="w-full accent-primary h-1.5 bg-slate-200 rounded-lg cursor-pointer mt-2"/>
            </div>
          </div>

          <!-- Public/Private visibility toggle -->
          <div class="border-t border-slate-100 pt-4">
            <label class="flex items-center justify-between bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 cursor-pointer select-none">
              <div>
                <p class="font-medium text-primary text-sm">Public Visibility</p>
                <p class="text-[11px] text-on-surface-variant">Allow clients with the link to view matching listings. Private filters are restricted to you.</p>
              </div>
              <input type="checkbox" id="filter-is-public" checked class="h-4 w-4 accent-primary" />
            </label>
          </div>

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3 shrink-0">
          <button onclick="closeCustomFilterModal()" class="px-5 py-2 rounded-lg border border-outline-variant text-on-surface-variant text-sm font-medium hover:bg-surface-container transition-colors">Cancel</button>
          <button onclick="saveCustomFilter()" class="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity">Save Filter</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeCustomFilterModal(); });

    // Autocomplete handling for location search
    const labelInput = document.getElementById('filter-center-label');
    const resultsDiv = document.getElementById('filter-location-results');
    let debounceTimer;

    if (labelInput && resultsDiv) {
        labelInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            if (query.length < 3) {
                resultsDiv.innerHTML = '';
                resultsDiv.classList.add('hidden');
                return;
            }
            debounceTimer = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=IN&limit=5`)
                    .then(res => res.json())
                    .then(data => {
                        resultsDiv.innerHTML = '';
                        if (data.length === 0) {
                            resultsDiv.innerHTML = '<div class="p-3 text-xs text-slate-500 font-medium bg-white">No locations found.</div>';
                        } else {
                            data.forEach(item => {
                                const div = document.createElement('div');
                                div.className = 'px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center gap-2 text-slate-700 location-result-item';
                                div.innerHTML = `
                                    <span class="material-symbols-outlined text-slate-400 text-[18px]">location_on</span>
                                    <div class="flex flex-col min-w-0">
                                        <span class="text-xs font-semibold truncate text-slate-800">${item.display_name.split(',')[0]}</span>
                                        <span class="text-[9px] text-slate-400 truncate">${item.display_name}</span>
                                    </div>
                                `;
                                div.onclick = () => {
                                    labelInput.value = item.display_name.split(',')[0];
                                    updateModalLocationCoordinates(item.lat, item.lon, false);
                                    resultsDiv.innerHTML = '';
                                    resultsDiv.classList.add('hidden');
                                    syncLocationMapView('filter-modal-map', item.lat, item.lon);
                                };
                                resultsDiv.appendChild(div);
                            });
                        }
                        resultsDiv.classList.remove('hidden');
                    })
                    .catch(err => console.error('Autocomplete query failed:', err));
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!labelInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.classList.add('hidden');
            }
        });
    }

    wireUseCurrentLocationButton('filter-use-location-btn', {
        latInputId: 'filter-center-lat',
        lngInputId: 'filter-center-lng',
        labelInputId: 'filter-center-label',
        mapContainerId: 'filter-modal-map'
    });

    wireLocationMapToggleButton('filter-toggle-map-btn', 'filter-modal-map', {
        latInputId: 'filter-center-lat',
        lngInputId: 'filter-center-lng',
        labelInputId: 'filter-center-label'
    });

    const filterIntentSelect = document.getElementById('filter-intent');
    if (filterIntentSelect) {
        filterIntentSelect.addEventListener('change', updateFilterPriceLabels);
        updateFilterPriceLabels();
    }

    // Radius range slider updating text labels
    const radiusSlider = document.getElementById('filter-radius');
    const radiusText = document.getElementById('filter-radius-val');
    if (radiusSlider && radiusText) {
        const updateText = () => {
            const val = parseInt(radiusSlider.value);
            if (val >= 10000) {
                radiusText.textContent = '10.0 km+';
            } else if (val >= 1000) {
                radiusText.textContent = (val / 1000).toFixed(1) + ' km';
            } else {
                radiusText.textContent = val + ' m';
            }
        };
        radiusSlider.addEventListener('input', updateText);
    }
}

export async function openCustomFilterModal(id) {
    injectCustomFilterModal();
    const modal = document.getElementById('custom-filter-modal');
    if (!modal) return;

    if (id) {
        // Edit flow
        editFilterId = id;
        document.getElementById('filter-modal-title').textContent = 'Edit Custom Filter';
        
        const { data: filter, error } = await supabase
            .from('custom_filters')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !filter) {
            showToast('Failed to load filter details.', true);
            return;
        }

        document.getElementById('filter-name').value = filter.name || '';
        const crit = filter.criteria || {};
        document.getElementById('filter-type').value = crit.type || 'Any';
        document.getElementById('filter-intent').value = crit.intent || 'Any';
        document.getElementById('filter-beds-min').value = crit.bedsMin || '';
        document.getElementById('filter-beds-max').value = crit.bedsMax || '';
        document.getElementById('filter-price-min').value = crit.priceMin || '';
        document.getElementById('filter-price-max').value = crit.priceMax || '';
        document.getElementById('filter-sqft-min').value = crit.sqftMin || '';
        document.getElementById('filter-sqft-max').value = crit.sqftMax || '';
        document.getElementById('filter-center-label').value = crit.centerLabel || '';
        document.getElementById('filter-center-lat').value = crit.centerLat || '';
        document.getElementById('filter-center-lng').value = crit.centerLng || '';
        
        const radiusSlider = document.getElementById('filter-radius');
        if (radiusSlider) {
            radiusSlider.value = crit.radius || 1000;
            radiusSlider.dispatchEvent(new Event('input'));
        }

        document.getElementById('filter-is-public').checked = filter.is_public !== false;

        updateFilterPriceLabels();

        // Leaflet map refresh if not hidden
        const mapDiv = document.getElementById('filter-modal-map');
        if (mapDiv && !mapDiv.classList.contains('hidden')) {
            const lat = parseFloat(crit.centerLat);
            const lng = parseFloat(crit.centerLng);
            if (!isNaN(lat) && !isNaN(lng)) {
                initModalLeafletMap(lat, lng);
            }
        }
    } else {
        // Create flow
        editFilterId = null;
        document.getElementById('filter-modal-title').textContent = 'Create Custom Filter';
        
        document.getElementById('filter-name').value = '';
        document.getElementById('filter-type').value = 'Any';
        document.getElementById('filter-intent').value = 'Any';
        document.getElementById('filter-beds-min').value = '';
        document.getElementById('filter-beds-max').value = '';
        document.getElementById('filter-price-min').value = '';
        document.getElementById('filter-price-max').value = '';
        document.getElementById('filter-sqft-min').value = '';
        document.getElementById('filter-sqft-max').value = '';
        document.getElementById('filter-center-label').value = '';
        document.getElementById('filter-center-lat').value = '';
        document.getElementById('filter-center-lng').value = '';
        
        const radiusSlider = document.getElementById('filter-radius');
        if (radiusSlider) {
            radiusSlider.value = 1000;
            radiusSlider.dispatchEvent(new Event('input'));
        }
        document.getElementById('filter-is-public').checked = true;

        const mapDiv = document.getElementById('filter-modal-map');
        if (mapDiv) mapDiv.classList.add('hidden');
        const toggleMapBtn = document.getElementById('filter-toggle-map-btn');
        if (toggleMapBtn) toggleMapBtn.textContent = 'Choose on Map';
        updateFilterPriceLabels();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeCustomFilterModal() {
    const modal = document.getElementById('custom-filter-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

export async function saveCustomFilter() {
    const name = document.getElementById('filter-name').value.trim();
    const type = document.getElementById('filter-type').value;
    const intent = document.getElementById('filter-intent').value;
    const bedsMin = document.getElementById('filter-beds-min').value;
    const bedsMax = document.getElementById('filter-beds-max').value;
    const priceMin = document.getElementById('filter-price-min').value;
    const priceMax = document.getElementById('filter-price-max').value;
    const sqftMin = document.getElementById('filter-sqft-min').value;
    const sqftMax = document.getElementById('filter-sqft-max').value;
    const centerLabel = document.getElementById('filter-center-label').value.trim();
    const centerLat = document.getElementById('filter-center-lat').value;
    const centerLng = document.getElementById('filter-center-lng').value;
    const radius = document.getElementById('filter-radius').value;
    const is_public = document.getElementById('filter-is-public').checked;

    if (!name) {
        showToast('Please enter a filter name.', true);
        return;
    }
    if (!centerLabel || !centerLat || !centerLng) {
        showToast('Please specify a center location coordinates.', true);
        return;
    }

    if (window.hasProfanity && (window.hasProfanity(name) || window.hasProfanity(centerLabel))) {
        showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        showToast('Error: No active user session.', true);
        return;
    }

    const filterData = {
        name,
        is_public,
        criteria: {
            type,
            intent,
            bedsMin,
            bedsMax,
            priceMin,
            priceMax,
            priceUnit: intent === 'Buy' ? 'crore' : 'monthly',
            sqftMin,
            sqftMax,
            centerLabel,
            centerLat,
            centerLng,
            radius
        }
    };

    let error = null;

    if (editFilterId) {
        const result = await supabase
            .from('custom_filters')
            .update(filterData)
            .eq('id', editFilterId);
        error = result.error;
    } else {
        const uniqueSlug = Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6);
        filterData.broker_id = user.id;
        filterData.slug = uniqueSlug;

        const result = await supabase
            .from('custom_filters')
            .insert([filterData]);
        error = result.error;
    }

    if (error) {
        const isSchemaMissing =
            error.code === 'PGRST204' ||
            error.code === '42703' ||
            (error.message && (
                error.message.toLowerCase().includes('column') ||
                error.message.toLowerCase().includes('schema cache')
            ));
        const msg = isSchemaMissing
            ? 'Database schema is outdated — the custom_filters table is missing required columns (slug, is_public). Please run scripts/migrations/custom_filters_v2.sql in your Supabase SQL Editor, then try again.'
            : 'Error saving filter: ' + error.message;
        showToast(msg, true);
    } else {
        showToast('Custom filter saved successfully.');
        closeCustomFilterModal();
        await renderCustomFilters();
    }
}

export async function deleteCustomFilter(filterId) {
    if (!confirm('Are you sure you want to delete this custom filter?')) return;
    const { error } = await supabase.from('custom_filters').delete().eq('id', filterId);
    if (error) {
        showToast('Error deleting filter: ' + error.message, true);
    } else {
        showToast('Custom filter deleted.');
        await renderCustomFilters();
    }
}

export async function copyShareLink(filterId) {
    const { data: filter, error } = await supabase
        .from('custom_filters')
        .select('*')
        .eq('id', filterId)
        .single();

    if (error || !filter) {
        showToast('Filter not found.', true);
        return;
    }

    const shareUrl = `${window.location.origin}/shared-filter/${filter.slug}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Shareable link copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy link.', true);
    });
}

export async function testCustomFilter(filterId) {
    const { data: filter, error } = await supabase
        .from('custom_filters')
        .select('*')
        .eq('id', filterId)
        .single();

    if (error || !filter) return;

    const shareUrl = `${window.location.origin}/shared-filter/${filter.slug}`;

    if (window.ajaxLoadPage) {
        window.ajaxLoadPage(shareUrl, false);
    } else {
        window.open(shareUrl, '_blank');
    }
}

// Preserve global window bindings
window.openCustomFilterModal = openCustomFilterModal;
window.closeCustomFilterModal = closeCustomFilterModal;
window.saveCustomFilter = saveCustomFilter;
window.deleteCustomFilter = deleteCustomFilter;
window.copyShareLink = copyShareLink;
window.testCustomFilter = testCustomFilter;
