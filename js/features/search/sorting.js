/**
 * Sorting Feature Module
 * Sorts listing DOM elements based on price or date.
 */

export function sortListingCards(cards, sortVal) {
    return [...cards].sort((a, b) => {
        if (sortVal === 'price-low') {
            return (parseFloat(a.dataset.price) || 0) - (parseFloat(b.dataset.price) || 0);
        }
        if (sortVal === 'price-high') {
            return (parseFloat(b.dataset.price) || 0) - (parseFloat(a.dataset.price) || 0);
        }
        if (sortVal === 'newest') {
            return new Date(b.dataset.date) - new Date(a.dataset.date);
        }
        return 0;
    });
}
