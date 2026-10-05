/**
 * Authentication Service
 * Pure business/data logic for authentication and profile lookup.
 * Completely decoupled from the DOM.
 */

import { supabase } from '../core/supabase-client.js';

export async function getCurrentSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Error fetching session:', error);
        return null;
    }
    return session;
}

export async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error fetching user:', error);
        return null;
    }
    return user;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getUserProfile(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
    return data;
}

export async function createUserProfile(profileData) {
    const { data, error } = await supabase
        .from('profiles')
        .insert(profileData)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getUserRole(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

    if (error || !data) return null;
    return data.role;
}

export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return () => {
        subscription.unsubscribe();
    };
}
