/**
 * Grid / List View Toggle UI Component
 * Toggles listing container layout between card grid and horizontal list.
 */

import { showToast } from './toast.js';

export function initGridListToggle({
    gridId = 'property-grid',
    gridBtnId = 'view-grid',
    listBtnId = 'view-list',
    cardSelector = '.property-card'
} = {}) {
    const propertyGrid = document.getElementById(gridId);
    const gridBtn = document.getElementById(gridBtnId);
    const listBtn = document.getElementById(listBtnId);

    if (!propertyGrid || !gridBtn || !listBtn) return;

    gridBtn.onclick = () => {
        propertyGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-10';
        gridBtn.classList.add('bg-white', 'shadow-sm', 'text-primary');
        listBtn.classList.remove('bg-white', 'shadow-sm', 'text-primary');
        const cards = propertyGrid.querySelectorAll(cardSelector);
        cards.forEach(c => c.classList.remove('flex', 'gap-6', 'items-center'));
        showToast('Switched to Grid View');
    };

    listBtn.onclick = () => {
        propertyGrid.className = 'grid grid-cols-1 gap-8';
        listBtn.classList.add('bg-white', 'shadow-sm', 'text-primary');
        gridBtn.classList.remove('bg-white', 'shadow-sm', 'text-primary');
        const cards = propertyGrid.querySelectorAll(cardSelector);
        cards.forEach(c => c.classList.add('flex', 'gap-6', 'items-center'));
        showToast('Switched to List View');
    };
}
