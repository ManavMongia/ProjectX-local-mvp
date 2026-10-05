/**
 * Location Service
 * Pure data operations for geocoding and reverse geocoding via OpenStreetMap (Nominatim).
 * Zero DOM dependencies.
 */

export function formatNominatimAddress(displayName) {
    if (!displayName) return '';
    const parts = displayName.split(',');
    return parts.slice(0, 3).map(p => p.trim()).join(', ');
}

export async function searchLocation(query, { countrycodes = 'IN', limit = 5 } = {}) {
    if (!query || query.trim().length < 3) return [];
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${countrycodes}&limit=${limit}`
        );
        if (!response.ok) throw new Error(`Nominatim request failed: ${response.status}`);
        const data = await response.json();
        return data || [];
    } catch (err) {
        console.error('Location autocomplete search failed:', err);
        return [];
    }
}

export async function reverseGeocode(lat, lng) {
    if (lat == null || lng == null) return null;
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );
        if (!response.ok) throw new Error(`Nominatim reverse request failed: ${response.status}`);
        const data = await response.json();
        return data || null;
    } catch (err) {
        console.error('Reverse geocoding failed:', err);
        return null;
    }
}

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
}
