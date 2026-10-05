/**
 * Authentication Guard Feature
 * Route protection, role enforcement, and session verification.
 */

import { getCurrentSession, getUserProfile, signOut } from '../../services/auth-service.js';
import { roleHomePage, roleAllowedPages, guestPages, clearAuthStorage } from '../../core/auth-state.js';
import { resolveCurrentPage, isAuthOrLoginPage } from '../../core/app-state.js';
import { navigateTo } from '../../core/router.js';
import { updateHeaderVisibility } from '../../ui/navigation.js';

export async function checkAuth() {
    const session = await getCurrentSession();
    const localRole = localStorage.getItem('role');
    const currentPage = resolveCurrentPage();
    const isLoginPage = isAuthOrLoginPage(currentPage);
    const isGuestPage = guestPages.includes(currentPage);

    if (!session && localRole !== 'Guest' && !isLoginPage) {
        if (!isGuestPage) {
            navigateTo('login.html');
            return;
        }
    }

    let role = localRole;
    if (!session && isGuestPage) {
        role = 'Guest';
    }

    if (session) {
        const profile = await getUserProfile(session.user.id);
        if (profile) {
            role = profile.role;
            const activeRole = localStorage.getItem('role');
            if (role === 'Admin' && (activeRole === 'Broker' || activeRole === 'Employee' || activeRole === 'Admin')) {
                role = activeRole;
            } else {
                localStorage.setItem('role', role);
            }

            // Hydrate savedProperties from Supabase preferences
            const remoteSaved = profile?.preferences?.saved_listings;
            if (remoteSaved && Array.isArray(remoteSaved)) {
                localStorage.setItem('savedProperties', JSON.stringify(remoteSaved));
            }
        }
    }

    if (isLoginPage) {
        if (session && role) {
            navigateTo(roleHomePage[role] || 'index.html');
        }
    } else {
        const allowed = roleAllowedPages[role || 'Guest'];
        if (allowed && !allowed.includes(currentPage)) {
            navigateTo(roleHomePage[role || 'Guest']);
        } else {
            updateHeaderVisibility();
        }
    }
}

export async function login(role, name, targetRole = null) {
    if (role === 'Guest') {
        localStorage.setItem('role', 'Guest');
        navigateTo(roleHomePage['Guest']);
        return;
    }
    
    localStorage.setItem('role', targetRole || role);
    if (name) localStorage.setItem('userName', name);
    
    if (role === 'Admin' && targetRole && roleHomePage[targetRole]) {
        navigateTo(roleHomePage[targetRole]);
    } else {
        navigateTo(roleHomePage[role] || 'index.html');
    }
}

export async function logout() {
    try {
        await signOut();
    } catch (err) {
        console.error('Error signing out:', err);
    }
    clearAuthStorage();
    navigateTo('login.html');
}

// Preserve window bindings for HTML onclick attributes
window.login = login;
window.logout = logout;
