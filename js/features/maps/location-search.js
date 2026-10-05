/**
 * Location Search & Picker UI Module
 * Integrates Nominatim autocomplete dropdowns and Leaflet location pickers.
 */

import { searchLocation, reverseGeocode, formatNominatimAddress } from '../../services/location-service.js';
import { showToast } from '../../ui/toast.js';

export const DEFAULT_MAP_CENTER = { lat: 19.0760, lng: 72.8777 };
export const locationMaps = {};

export function updateLocationPickerFields({ lat, lng, latInputId, lngInputId, labelInputId, doGeocode = false }) {
    const latEl = document.getElementById(latInputId);
    const lngEl = document.getElementById(lngInputId);
    if (latEl) latEl.value = parseFloat(lat).toFixed(6);
    if (lngEl) lngEl.value = parseFloat(lng).toFixed(6);
    if (doGeocode && labelInputId) {
        reverseGeocode(lat, lng).then(data => {
            if (data?.display_name) {
                const el = document.getElementById(labelInputId);
                if (el) el.value = formatNominatimAddress(data.display_name);
            }
        });
    }
}

export function syncLocationMapView(containerId, lat, lng, zoom = 15) {
    const entry = locationMaps[containerId];
    if (entry?.map && entry?.marker) {
        entry.map.setView([lat, lng], zoom);
        entry.marker.setLatLng([lat, lng]);
    }
}

export function initLeafletPickerMap(containerId, lat, lng, onCoordinatesChange) {
    if (typeof L === 'undefined') {
        console.warn('Leaflet map framework not loaded on window');
        return null;
    }
    const container = document.getElementById(containerId);
    if (!container) return null;

    let entry = locationMaps[containerId];
    if (!entry) {
        const map = L.map(containerId).setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            onCoordinatesChange(pos.lat, pos.lng, true);
        });
        map.on('click', (e) => {
            marker.setLatLng(e.latlng);
            onCoordinatesChange(e.latlng.lat, e.latlng.lng, true);
        });
        entry = { map, marker };
        locationMaps[containerId] = entry;
        setTimeout(() => map.invalidateSize(), 150);
    } else {
        entry.map.setView([lat, lng], 13);
        entry.marker.setLatLng([lat, lng]);
        setTimeout(() => entry.map.invalidateSize(), 100);
    }
    return entry;
}

export function wireUseCurrentLocationButton(buttonId, { latInputId, lngInputId, labelInputId, mapContainerId }) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.onclick = (e) => {
        e.preventDefault();
        if (!navigator.geolocation) {
            showToast('Geolocation is not supported by your browser.', true);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                updateLocationPickerFields({ lat, lng, latInputId, lngInputId, labelInputId, doGeocode: true });
                if (mapContainerId) syncLocationMapView(mapContainerId, lat, lng);
            },
            (err) => showToast('Failed to fetch location: ' + err.message, true)
        );
    };
}

export function wireLocationMapToggleButton(buttonId, mapContainerId, { latInputId, lngInputId, labelInputId, onCoordinatesChange }) {
    const toggleMapBtn = document.getElementById(buttonId);
    const mapDiv = document.getElementById(mapContainerId);
    if (!toggleMapBtn || !mapDiv) return;

    const defaultLabel = toggleMapBtn.innerHTML;
    toggleMapBtn.onclick = (e) => {
        e.preventDefault();
        const isHidden = mapDiv.classList.contains('hidden');
        if (isHidden) {
            mapDiv.classList.remove('hidden');
            toggleMapBtn.textContent = 'Hide Map';

            let lat = parseFloat(document.getElementById(latInputId).value);
            let lng = parseFloat(document.getElementById(lngInputId).value);
            if (isNaN(lat) || isNaN(lng)) {
                lat = DEFAULT_MAP_CENTER.lat;
                lng = DEFAULT_MAP_CENTER.lng;
                updateLocationPickerFields({ lat, lng, latInputId, lngInputId, labelInputId, doGeocode: false });
            }
            initLeafletPickerMap(mapContainerId, lat, lng, (lat, lng, doGeocode) => {
                updateLocationPickerFields({ lat, lng, latInputId, lngInputId, labelInputId, doGeocode });
                if (onCoordinatesChange) onCoordinatesChange(lat, lng, doGeocode);
            });
        } else {
            mapDiv.classList.add('hidden');
            toggleMapBtn.innerHTML = defaultLabel;
        }
    };
}

export function wireNominatimCitySearch(inputId, resultsId, options = {}) {
    const input = document.getElementById(inputId);
    const resultsDiv = document.getElementById(resultsId);
    if (!input || !resultsDiv) return;

    const cityOnly = options.cityOnly !== false;
    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query.length < 3) {
            resultsDiv.innerHTML = '';
            resultsDiv.classList.add('hidden');
            resultsDiv.classList.remove('flex');
            return;
        }
        debounceTimer = setTimeout(async () => {
            const data = await searchLocation(query, { countrycodes: 'IN', limit: 5 });
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
                        input.value = cityOnly
                            ? item.display_name.split(',')[0].trim()
                            : item.display_name.split(',').slice(0, 3).map(p => p.trim()).join(', ');
                        resultsDiv.innerHTML = '';
                        resultsDiv.classList.add('hidden');
                        resultsDiv.classList.remove('flex');
                        if (typeof options.onSelect === 'function') options.onSelect(item, input.value);
                    };
                    resultsDiv.appendChild(div);
                });
            }
            resultsDiv.classList.remove('hidden');
            resultsDiv.classList.add('flex');
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.classList.add('hidden');
        }
    });
}

// Preserve global binding
window.wireNominatimCitySearch = wireNominatimCitySearch;
