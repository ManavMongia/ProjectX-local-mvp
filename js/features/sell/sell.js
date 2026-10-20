/**
 * Sell / Valuation Feature
 * Handles property valuation inquiries and seller form validation.
 */

import { getCurrentSession } from '../../services/auth-service.js';
import { navigateTo } from '../../core/router.js';
import { showToast } from '../../ui/toast.js';

export async function initSellPage() {
    const form = document.getElementById('valuation-form');
    if (!form) return;

    const nameInput = document.getElementById('val-name');
    const emailInput = document.getElementById('val-email');
    const addressInput = document.getElementById('val-address');
    const typeSelect = document.getElementById('val-type');
    const phoneInput = document.getElementById('val-phone');

    // 1. Restore any pending valuation request saved prior to login redirect
    const pendingJson = sessionStorage.getItem('pending_valuation_request');
    if (pendingJson) {
        try {
            const pending = JSON.parse(pendingJson);
            if (pending.name && nameInput && !nameInput.value) nameInput.value = pending.name;
            if (pending.email && emailInput && !emailInput.value) emailInput.value = pending.email;
            if (pending.address && addressInput && !addressInput.value) addressInput.value = pending.address;
            if (pending.propertyType && typeSelect) typeSelect.value = pending.propertyType;
            if (pending.phone && phoneInput && !phoneInput.value) phoneInput.value = pending.phone;
        } catch (e) {
            console.error('Error parsing pending valuation data:', e);
        }
    }

    // 2. Pre-fill user details if logged in and fields are empty
    const session = await getCurrentSession();
    if (session?.user) {
        const metadata = session.user.user_metadata || {};
        const userName = metadata.full_name || localStorage.getItem('userName');
        const userEmail = session.user.email;
        const userPhone = session.user.phone;

        if (userName && nameInput && !nameInput.value) nameInput.value = userName;
        if (userEmail && emailInput && !emailInput.value) emailInput.value = userEmail;
        if (userPhone && phoneInput && !phoneInput.value) phoneInput.value = userPhone;
    }

    // 3. If returning with ?action=submit_valuation and authenticated
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'submit_valuation') {
        if (session) {
            sessionStorage.removeItem('pending_valuation_request');
            showToast('Valuation request submitted. Our team will contact you within 24 hours.', 'success');
            form.reset();
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    }

    // 4. Form submission handler
    form.onsubmit = async (e) => {
        e.preventDefault();
        const name = nameInput?.value?.trim();
        const email = emailInput?.value?.trim();
        const address = addressInput?.value?.trim();
        const phone = phoneInput?.value?.trim();
        const propertyType = typeSelect?.value;

        if (!name || !email || !address) {
            showToast('Please fill in all required fields.');
            return;
        }

        if (window.hasProfanity && (window.hasProfanity(name) || window.hasProfanity(address) || window.hasProfanity(phone))) {
            showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
            return;
        }

        // Authenticate user before completing selling / valuation request
        const currentSession = await getCurrentSession();
        if (!currentSession) {
            sessionStorage.setItem('pending_valuation_request', JSON.stringify({
                name,
                email,
                address,
                phone,
                propertyType
            }));
            showToast('Please sign in or create an account to submit your property request.');
            navigateTo('login.html?role=Seller&redirect=sell.html&action=submit_valuation');
            return;
        }

        sessionStorage.removeItem('pending_valuation_request');
        showToast('Valuation request submitted. Our team will contact you within 24 hours.', 'success');
        form.reset();
    };
}
