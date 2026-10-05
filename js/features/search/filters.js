/**
 * Search Filters Feature Module
 * Evaluates listing card visibility against search query, types, price, beds, and baths.
 */

export function filterListingCard(card, { query, selectedTypes, minPrice, maxPrice, activeBeds, activeBaths }) {
    const title = (card.dataset.title || '').toLowerCase();
    const location = (card.dataset.location || '').toLowerCase();
    const type = card.dataset.type;
    const beds = parseFloat(card.dataset.beds) || 0;
    const baths = parseFloat(card.dataset.baths) || 0;
    const price = parseFloat(card.dataset.price) || 0;

    const matchesSearch = !query || title.includes(query) || location.includes(query);
    const matchesType = !selectedTypes || selectedTypes.length === 0 || selectedTypes.includes(type);
    const matchesBeds = beds >= parseFloat(activeBeds || 0);
    const matchesBaths = baths >= parseFloat(activeBaths || 0);
    const matchesPrice = price >= minPrice && price <= maxPrice;

    return matchesSearch && matchesType && matchesBeds && matchesBaths && matchesPrice;
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
        b.classList.remove('bg-primary', 'text-on-primary');
    });
}
