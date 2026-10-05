/**
 * Sell / Valuation Feature
 * Handles property valuation inquiries and seller form validation.
 */

import { showToast } from '../../ui/toast.js';

export function initSellPage() {
    const form = document.getElementById('valuation-form');
    if (!form) return;

    form.onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('val-name')?.value?.trim();
        const email = document.getElementById('val-email')?.value?.trim();
        const address = document.getElementById('val-address')?.value?.trim();
        const phone = document.getElementById('val-phone')?.value?.trim();

        if (!name || !email || !address) {
            showToast('Please fill in all required fields.');
            return;
        }

        if (window.hasProfanity && (window.hasProfanity(name) || window.hasProfanity(address) || window.hasProfanity(phone))) {
            showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
            return;
        }

        showToast('Valuation request submitted. Our team will contact you within 24 hours.');
        form.reset();
    };
}
