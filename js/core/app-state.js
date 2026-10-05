/**
 * App-Level Shared State
 * Tracks route information and genuine shared application context.
 */

export function resolveCurrentPage() {
    const currentPath = window.location.pathname;
    let page = currentPath.split('/').pop() || 'index.html';
    const isSharedFilterRoute = currentPath.includes('/shared-filter/') || page === 'shared-filter';
    if (isSharedFilterRoute) {
        page = 'shared-filter.html';
    } else if (!page.includes('.')) {
        page += '.html';
    }
    return page;
}

export function resolveAppBasePath() {
    const currentPath = window.location.pathname;
    const isSharedFilterRoute = currentPath.includes('/shared-filter/');
    if (isSharedFilterRoute) {
        return '/';
    }
    return currentPath.endsWith('/')
        ? currentPath
        : currentPath.slice(0, currentPath.lastIndexOf('/') + 1);
}

export function isAuthOrLoginPage(page = resolveCurrentPage()) {
    return page === 'login.html' || page === 'staff-login.html' || page === 'signup.html';
}

export function getUrlQueryParams() {
    return new URLSearchParams(window.location.search);
}

export function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
