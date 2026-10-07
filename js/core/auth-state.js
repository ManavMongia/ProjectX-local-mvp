/**
 * Shared Authentication & Session State Management
 * Clean state representation ready for future React Context / AuthProvider.
 */

export const buyerPages = [
    'index.html',
    'properties.html',
    'map.html',
    'property-details.html',
    'sell.html',
    'profile.html',
    'shared-filter.html'
];

export const guestPages = [
    'index.html',
    'properties.html',
    'map.html',
    'property-details.html',
    'sell.html',
    'shared-filter.html'
];

export const roleHomePage = {
    'Admin': 'admin-panel.html',
    'Employee': 'employee-panel.html',
    'Broker': 'broker-dashboard.html',
    'Seller': 'sell.html',
    'Buyer': 'index.html',
    'Guest': 'index.html'
};

export const roleAllowedPages = {
    'Admin': ['admin-panel.html', 'employee-panel.html', 'broker-dashboard.html', 'properties.html', 'map.html', 'property-details.html', 'profile.html', 'shared-filter.html'],
    'Employee': ['employee-panel.html', 'broker-dashboard.html', 'properties.html', 'map.html', 'property-details.html', 'profile.html', 'shared-filter.html'],
    'Broker': ['broker-dashboard.html', 'properties.html', 'map.html', 'property-details.html', 'profile.html', 'shared-filter.html'],
    'Seller': ['sell.html', 'broker-dashboard.html', 'properties.html', 'map.html', 'property-details.html', 'profile.html', 'index.html', 'shared-filter.html'],
    'Buyer': buyerPages,
    'Guest': guestPages
};

let currentSession = null;
let currentUser = null;

export function setAuthState({ session, user } = {}) {
    currentSession = session || null;
    currentUser = user || (session ? session.user : null);
}

export function getCachedSession() {
    return currentSession;
}

export function getCachedUser() {
    return currentUser;
}

export function getCurrentRole() {
    return localStorage.getItem('role') || 'Guest';
}

export function setCurrentRole(role) {
    if (role) {
        localStorage.setItem('role', role);
    } else {
        localStorage.removeItem('role');
    }
}

export function getStoredUserName() {
    return localStorage.getItem('userName') || '';
}

export function setStoredUserName(name) {
    if (name) {
        localStorage.setItem('userName', name);
    } else {
        localStorage.removeItem('userName');
    }
}

export function getReferredBy() {
    return localStorage.getItem('referred_by') || null;
}

export function setReferredBy(refId) {
    if (refId) {
        localStorage.setItem('referred_by', refId);
    } else {
        localStorage.removeItem('referred_by');
    }
}

export function clearAuthStorage() {
    localStorage.removeItem('role');
    localStorage.removeItem('userName');
    setAuthState({ session: null, user: null });
}
