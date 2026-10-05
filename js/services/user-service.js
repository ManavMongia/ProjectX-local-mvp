/**
 * User Service
 * Pure data operations for user profiles, preferences, saved listings, and referrals.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

export const DEFAULT_BROKER_AVATAR = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80';

export function resolveBrokerAvatarUrl(avatarUrl, userId) {
    if (avatarUrl) return avatarUrl;
    if (userId) {
        const cached = localStorage.getItem(`broker_avatar_${userId}`);
        if (cached) return cached;
    }
    return DEFAULT_BROKER_AVATAR;
}

export async function getProfile(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
    return data;
}

export const getUserProfile = getProfile;

export async function updateProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getUserPreferences(userId) {
    const profile = await getProfile(userId);
    return profile?.preferences || {};
}

export async function updateUserPreferences(userId, newPreferences) {
    const currentPrefs = await getUserPreferences(userId);
    const merged = { ...currentPrefs, ...newPreferences };

    const { data, error } = await supabase
        .from('profiles')
        .update({ preferences: merged })
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data.preferences;
}

export async function getSavedListings(userId) {
    if (!userId) {
        try {
            return JSON.parse(localStorage.getItem('savedProperties') || '[]');
        } catch {
            return [];
        }
    }
    const prefs = await getUserPreferences(userId);
    return Array.isArray(prefs.saved_listings) ? prefs.saved_listings : [];
}

export async function syncSavedListings(userId, savedListings) {
    // Sync localStorage
    localStorage.setItem('savedProperties', JSON.stringify(savedListings));

    // Sync remote profile if logged in
    if (userId) {
        await updateUserPreferences(userId, { saved_listings: savedListings });
    }
}

export async function getReferrals(userId) {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('referred_by', userId);

    if (error) {
        console.error('Error loading referrals:', error);
        return [];
    }
    return data || [];
}
