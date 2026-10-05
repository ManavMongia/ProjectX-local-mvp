/**
 * Pagination Feature Module
 * Handles pagination UI buttons and page switching events.
 */

import { showToast } from '../../ui/toast.js';

export function initPagination(selector = '.pagination-btn') {
    document.querySelectorAll(selector).forEach(btn => {
        btn.onclick = () => showToast('Pagination is demo-only in this build.');
    });
}
