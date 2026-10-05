/**
 * Moderation UI Module
 * Handles interactions on the Admin and Employee verification panels.
 */

import { showToast } from '../../ui/toast.js';

export function initAdminPanelInteractions() {
    document.querySelectorAll('button').forEach((button) => {
        const text = button.textContent.trim();
        const title = button.getAttribute('title');
        if (title === 'Approve') {
            button.addEventListener('click', () => {
                button.closest('tr, .flex')?.remove();
                showToast('Broker verification approved.');
            });
        } else if (title === 'Reject') {
            button.addEventListener('click', () => {
                button.closest('tr, .flex')?.remove();
                showToast('Broker verification rejected.');
            });
        } else if (text === 'Load More Queue Items') {
            button.addEventListener('click', () => showToast('All queue items are currently loaded.'));
        } else if (text.includes('View All Users')) {
            button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        } else if (text.includes('Export')) {
            button.addEventListener('click', () => showToast('Admin report prepared for export.'));
        } else if (text.includes('Invite')) {
            button.addEventListener('click', () => showToast('Invite workflow opened.'));
        }
    });
}

export function initEmployeePanelInteractions() {
    document.querySelectorAll('button').forEach((button) => {
        const text = button.textContent.trim();
        if (text === 'Approve') {
            button.addEventListener('click', () => {
                button.closest('article, div')?.classList.add('opacity-60');
                showToast('Listing approved.');
            });
        } else if (text === 'Flag') {
            button.addEventListener('click', () => showToast('Listing flagged for review.'));
        } else if (text === 'Remove') {
            button.addEventListener('click', () => {
                button.closest('article, div')?.remove();
                showToast('Listing removed from queue.');
            });
        } else if (text === 'View All') {
            button.addEventListener('click', () => showToast('All assigned items are visible.'));
        }
    });
}
