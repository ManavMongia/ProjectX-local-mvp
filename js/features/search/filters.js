/**
 * Search Filters Feature Module
 * Evaluates listing card visibility against search query, types, price, beds, baths,
 * sqft, intent, verification, sold-out status, recent listings, and availability dates.
 */

import {
    matchesRecentListing,
    matchesAvailableFrom,
    matchesVerification,
    matchesAvailabilityStatus,
    normalizeDateString
} from '../../services/listing-service.js';

export {
    matchesRecentListing,
    matchesAvailableFrom,
    matchesVerification,
    matchesAvailabilityStatus,
    normalizeDateString
};

export function filterListingCard(card, criteria = {}) {
    const {
        query,
        selectedTypes,
        minPrice = 0,
        maxPrice = Infinity,
        activeBeds = 0,
        activeBaths = 0,
        intent = 'all',
        location: filterLoc = '',
        minSqft = 0,
        maxSqft = Infinity,
        recent = null,
        availableFrom = null,
        verification = 'all',
        availabilityStatus = 'all'
    } = criteria;

    const title = (card.dataset.title || '').toLowerCase();
    const location = (card.dataset.location || '').toLowerCase();
    const type = card.dataset.type || '';
    const beds = parseFloat(card.dataset.beds) || 0;
    const baths = parseFloat(card.dataset.baths) || 0;
    const price = parseFloat(card.dataset.price) || 0;
    const sqft = parseFloat(card.dataset.sqft) || 0;
    const cardIntent = (card.dataset.intent || '').toLowerCase();
    const isVerified = card.dataset.verified === 'true';
    const status = card.dataset.status || 'Active';
    const cardAvailableFrom = card.dataset.availableFrom || null;
    const createdAt = card.dataset.createdAt || card.dataset.date || null;

    // 1. Text Search Query
    if (query) {
        const q = query.toLowerCase().trim();
        if (!title.includes(q) && !location.includes(q)) return false;
    }

    // 2. Specific Location
    if (filterLoc && filterLoc !== 'all') {
        const locLower = filterLoc.toLowerCase().trim();
        if (!location.includes(locLower)) return false;
    }

    // 3. Property Intent
    if (intent && intent !== 'all') {
        const normIntent = intent.toLowerCase().trim();
        if (normIntent === 'buy' && cardIntent !== 'buy' && cardIntent !== 'sell') return false;
        if (normIntent === 'rent' && cardIntent !== 'rent') return false;
    }

    // 4. Property Type (Multi-select)
    if (selectedTypes && selectedTypes.length > 0) {
        const matchesType = selectedTypes.some(t => t.toLowerCase() === type.toLowerCase());
        if (!matchesType) return false;
    }

    // 5. Price Range
    if (price < minPrice || price > maxPrice) return false;

    // 6. Bedrooms
    if (activeBeds > 0 && beds < parseFloat(activeBeds)) return false;

    // 7. Bathrooms
    if (activeBaths > 0 && baths < parseFloat(activeBaths)) return false;

    // 8. Square Footage
    if (minSqft > 0 && sqft < minSqft) return false;
    if (maxSqft < Infinity && sqft > maxSqft) return false;

    // 9. Recent Listings Filter (created_at >= now - window)
    if (!matchesRecentListing(createdAt, recent)) return false;

    // 10. Available From Filter (available_from <= selected_date)
    if (!matchesAvailableFrom(cardAvailableFrom, availableFrom)) return false;

    // 11. Verification Status (All / Verified / Non-Verified)
    if (!matchesVerification(isVerified, verification)) return false;

    // 12. Availability Status (All / Available / Sold Out)
    if (!matchesAvailabilityStatus(status, availabilityStatus)) return false;

    return true;
}

export function resetFilterInputs() {
    const searchInput = document.getElementById('listing-search-input');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('input[name="type"]').forEach(i => { i.checked = false; });

    const priceMin = document.getElementById('price-min');
    if (priceMin) priceMin.value = '';

    const priceMax = document.getElementById('price-max');
    if (priceMax) priceMax.value = '';

    document.querySelectorAll('button[data-filter]').forEach(b => {
        b.classList.remove('bg-primary', 'text-on-primary', 'bg-slate-900', 'text-white', 'border-slate-900');
    });

    // Reset Centralized Filter Drawer inputs if present
    document.querySelectorAll('#centralized-filters-drawer input[type="checkbox"]').forEach(i => { i.checked = false; });
    document.querySelectorAll('#centralized-filters-drawer input[type="radio"]').forEach(i => { i.checked = (i.value === 'all' || i.value === '0'); });
    
    const drawerAvailFrom = document.getElementById('drawer-filter-available-from');
    if (drawerAvailFrom) drawerAvailFrom.value = '';

    const drawerLoc = document.getElementById('drawer-filter-location');
    if (drawerLoc) drawerLoc.value = '';

    const drawerMinPrice = document.getElementById('drawer-price-min');
    if (drawerMinPrice) drawerMinPrice.value = '';
    const drawerMaxPrice = document.getElementById('drawer-price-max');
    if (drawerMaxPrice) drawerMaxPrice.value = '';

    const drawerMinSqft = document.getElementById('drawer-sqft-min');
    if (drawerMinSqft) drawerMinSqft.value = '';
    const drawerMaxSqft = document.getElementById('drawer-sqft-max');
    if (drawerMaxSqft) drawerMaxSqft.value = '';
}
