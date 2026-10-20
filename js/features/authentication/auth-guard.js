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
    const currentPage = resolveCurrentPage();
    const isLoginPage = isAuthOrLoginPage(currentPage);
    const isGuestPage = guestPages.includes(currentPage);

    if (!session) {
        localStorage.setItem('role', 'Guest');
        localStorage.removeItem('userName');

        if (!isLoginPage && !isGuestPage) {
            const redirectUrl = `${currentPage}${window.location.search || ''}`;
            navigateTo(`login.html?redirect=${encodeURIComponent(redirectUrl)}`);
            return;
        }

        if (!isLoginPage) {
            updateHeaderVisibility('Guest');
        }
        return;
    }

    let role = localStorage.getItem('role') || 'Buyer';
    const profile = await getUserProfile(session.user.id);
    if (profile) {
        role = profile.role || 'Buyer';
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
    } else {
        localStorage.setItem('role', role);
    }

    if (isLoginPage) {
        const params = new URLSearchParams(window.location.search);
        const redirectParam = params.get('redirect');
        const actionParam = params.get('action');
        if (redirectParam) {
            let targetUrl = redirectParam;
            if (actionParam && !targetUrl.includes('action=')) {
                targetUrl += (targetUrl.includes('?') ? '&' : '?') + `action=${encodeURIComponent(actionParam)}`;
            }
            navigateTo(targetUrl);
            return;
        }
        navigateTo(roleHomePage[role] || 'index.html');
    } else {
        const allowed = roleAllowedPages[role || 'Guest'];
        if (allowed && !allowed.includes(currentPage)) {
            navigateTo(roleHomePage[role || 'Guest']);
        } else {
            updateHeaderVisibility(role);
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
    
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get('redirect');
    const actionParam = params.get('action');
    if (redirectParam) {
        let targetUrl = redirectParam;
        if (actionParam && !targetUrl.includes('action=')) {
            targetUrl += (targetUrl.includes('?') ? '&' : '?') + `action=${encodeURIComponent(actionParam)}`;
        }
        navigateTo(targetUrl);
        return;
    }

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
