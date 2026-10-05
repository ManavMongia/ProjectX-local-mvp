/**
 * User Favorites Feature
 * Manages saved properties in localStorage and synchronizes with Supabase profile preferences.
 */

import { supabase } from '../../core/supabase-client.js';
import { syncSavedListings as serviceSyncSavedListings } from '../../services/user-service.js';
import { showToast } from '../../ui/toast.js';

export function getLocalSavedProperties() {
    try {
        return JSON.parse(localStorage.getItem('savedProperties')) || [];
    } catch {
        return [];
    }
}

export function setLocalSavedProperties(saved) {
    localStorage.setItem('savedProperties', JSON.stringify(saved));
}

export async function syncSavedPropertiesToRemote(saved) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await serviceSyncSavedListings(session.user.id, saved);
        }
    } catch (err) {
        console.error('Failed to sync favorites to remote:', err);
    }
}

export async function togglePropertyFavorite(listingId) {
    let saved = getLocalSavedProperties();
    const idStr = String(listingId);
    let isSaved = false;

    if (saved.some(id => String(id) === idStr)) {
        saved = saved.filter(id => String(id) !== idStr);
        showToast('Property removed from your favorites.');
    } else {
        saved.push(listingId);
        isSaved = true;
        showToast('Property saved to your favorites.');
    }

    setLocalSavedProperties(saved);
    syncSavedHearts();
    await syncSavedPropertiesToRemote(saved);
    return isSaved;
}

export function syncSavedHearts() {
    const saved = getLocalSavedProperties().map(String);
    document.querySelectorAll('.save-property-btn').forEach(btn => {
        const card = btn.closest('[data-id]') || btn.closest('div');
        const id = btn.dataset.id || card?.dataset?.id;
        const icon = btn.querySelector('.material-symbols-outlined') || btn;
        if (id && saved.includes(String(id))) {
            icon.classList.remove('text-slate-400');
            icon.classList.add('text-rose-500', 'fill-current');
            btn.classList.add('saved');
        } else {
            icon.classList.add('text-slate-400');
            icon.classList.remove('text-rose-500', 'fill-current');
            btn.classList.remove('saved');
        }
    });
}
