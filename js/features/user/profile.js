/**
 * User Profile Feature
 * Broker profile display synchronization, avatar resolution, and custom event handlers.
 */

import { supabase } from '../../core/supabase-client.js';

export const DEFAULT_BROKER_AVATAR = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&q=80';

export function resolveBrokerAvatarUrl(avatarUrl, userId) {
    if (avatarUrl) return avatarUrl;
    if (userId) {
        const cached = localStorage.getItem(`broker_avatar_${userId}`);
        if (cached) return cached;
    }
    return DEFAULT_BROKER_AVATAR;
}

export function applyBrokerProfileDisplay({ name, avatarUrl, userId } = {}) {
    const displayName = name || localStorage.getItem('userName') || 'Broker';
    const resolvedAvatar = resolveBrokerAvatarUrl(avatarUrl, userId);

    ['broker-profile-img', 'mobile-broker-profile-img'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.src = resolvedAvatar;
    });

    const nameEl = document.getElementById('broker-company-name');
    if (nameEl) nameEl.textContent = displayName;

    const mobileNameEl = document.getElementById('mobile-broker-name');
    if (mobileNameEl) mobileNameEl.textContent = displayName;

    if (name) localStorage.setItem('userName', name);
    if (avatarUrl && userId) localStorage.setItem(`broker_avatar_${userId}`, avatarUrl);
}

export async function loadAndApplyBrokerProfileDisplay() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        applyBrokerProfileDisplay();
        return;
    }

    const userId = session.user.id;
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single();

    applyBrokerProfileDisplay({
        name: profile?.full_name,
        avatarUrl: profile?.avatar_url,
        userId
    });
}

// Preserve global window binding
window.applyBrokerProfileDisplay = applyBrokerProfileDisplay;

// Custom event listeners for profile updates
window.addEventListener('brokerAvatarUpdated', (e) => {
    const { url, userId } = e.detail || {};
    applyBrokerProfileDisplay({ avatarUrl: url, userId });
});

window.addEventListener('brokerProfileUpdated', (e) => {
    const { name, avatarUrl, userId } = e.detail || {};
    applyBrokerProfileDisplay({ name, avatarUrl, userId });
});
