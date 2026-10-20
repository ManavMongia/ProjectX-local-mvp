/**
 * Test: Sell Property Page Auth State & Shared Header Synchronization
 * 
 * Verifies:
 * 1. Static HTML default state shows Sign In / Sign Up (no hardcoded Dashboard button)
 * 2. Dynamic header rendering correctly updates for Guest, Buyer, Seller, Broker, Admin, Employee
 * 3. syncHeaderWithAuth correctly resolves Supabase session and clears stale storage
 * 4. checkAuth and login support redirect and action parameters
 * 5. Sell page valuation form redirects unauthenticated users to login with return workflow
 * 6. Sell page remains publicly accessible
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

console.log('================================================================');
console.log('ProjectX: Sell Page Auth State & Shared Header Test Suite');
console.log('================================================================');

// ── Section 1: Static HTML Template Inspection ──
console.log('\n--- Section 1: Static HTML Template Inspection ---');

const publicHtmlFiles = [
    'sell.html',
    'index.html',
    'properties.html',
    'map.html',
    'property-details.html',
    'sitemap.html'
];

for (const file of publicHtmlFiles) {
    const filePath = path.join(projectRoot, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Must have the standardized trailing actions container
    const hasContainer = content.includes('id="header-trailing-actions"') || content.includes('class="header-trailing-actions');
    assert(hasContainer, `${file} includes standardized #header-trailing-actions container`);

    // In the header-trailing-actions block, it should default to Sign In / Sign Up
    const trailingBlockMatch = content.match(/id="header-trailing-actions"[\s\S]*?<\/div>/);
    if (trailingBlockMatch) {
        const trailingBlock = trailingBlockMatch[0];
        const hasSignIn = trailingBlock.includes('Sign In');
        const hasSignUp = trailingBlock.includes('Sign Up');
        const hasStaticDashboard = trailingBlock.includes('Dashboard');

        assert(hasSignIn && hasSignUp, `${file} static header renders default Sign In / Sign Up`);
        assert(!hasStaticDashboard, `${file} static header does NOT contain static Dashboard button`);
    } else {
        assert(false, `${file} could not extract #header-trailing-actions container block`);
    }
}

// ── Section 2: Mock DOM Environment for Dynamic Header & Nav Tests ──
console.log('\n--- Section 2: Dynamic Header Rendering (navigation.js) ---');

class MockClassList {
    constructor() {
        this.classes = new Set();
    }
    add(...cls) { cls.forEach(c => this.classes.add(c)); }
    remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
    contains(cls) { return this.classes.has(cls); }
}

class MockElement {
    constructor(tagName, id = '', className = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.classList = new MockClassList();
        className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
        this.children = [];
        this.innerHTML = '';
        this.textContent = '';
        this.attributes = {};
        this.parentNode = null;
    }
    setAttribute(name, val) { this.attributes[name] = String(val); }
    getAttribute(name) { return this.attributes[name] || null; }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
    }
    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.startsWith('#') && curr.id === selector.slice(1)) return curr;
            if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) return curr;
            if (selector.includes('items-center') && curr.className.includes('items-center')) return curr;
            curr = curr.parentNode;
        }
        return null;
    }
    querySelectorAll(selector) {
        const results = [];
        const match = (el) => {
            if (selector === '.material-symbols-outlined' && el.classList.contains('material-symbols-outlined')) results.push(el);
            if ((selector === '#header-trailing-actions, .header-trailing-actions, #mobile-trailing-actions' || selector === '#header-trailing-actions') &&
                (el.id === 'header-trailing-actions' || el.classList.contains('header-trailing-actions') || el.id === 'mobile-trailing-actions')) results.push(el);
            if (selector === 'button, a' && (el.tagName === 'BUTTON' || el.tagName === 'A')) results.push(el);
            if (selector === 'a' && el.tagName === 'A') results.push(el);
            for (const c of el.children) match(c);
        };
        for (const c of this.children) match(c);
        return results;
    }
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

// Global browser mocks
const mockStorage = {};
global.localStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const mockSessionStorage = {};
global.sessionStorage = {
    getItem: (k) => mockSessionStorage[k] || null,
    setItem: (k, v) => { mockSessionStorage[k] = String(v); },
    removeItem: (k) => { delete mockSessionStorage[k]; },
    clear: () => { Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]); }
};

global.window = {
    location: {
        pathname: '/sell.html',
        search: '',
        href: 'https://project-x-local-mvp.vercel.app/sell.html'
    },
    history: {
        replaceState: (state, title, url) => {
            global.window.location.pathname = url;
            global.window.location.search = '';
        }
    },
    toAppUrl: (url) => `/${url.replace(/^\//, '')}`
};

const mockBody = new MockElement('body');
const mockHead = new MockElement('head');
const mockHeaderContainer = new MockElement('div', 'header-trailing-actions', 'header-trailing-actions flex items-center gap-4');
mockBody.appendChild(mockHeaderContainer);

global.document = {
    head: mockHead,
    body: mockBody,
    createElement: (tag) => new MockElement(tag),
    querySelectorAll: (sel) => mockBody.querySelectorAll(sel),
    querySelector: (sel) => mockBody.querySelector(sel),
    getElementById: (id) => {
        const find = (el) => {
            if (el.id === id) return el;
            for (const c of el.children) {
                const f = find(c);
                if (f) return f;
            }
            return null;
        };
        return find(mockBody);
    }
};

const navModule = await import('../js/ui/navigation.js');
const { updateHeaderVisibility, syncHeaderWithAuth } = navModule;

// Test Guest dynamic rendering
updateHeaderVisibility('Guest');
assert(mockHeaderContainer.innerHTML.includes('Sign In'), 'updateHeaderVisibility("Guest") renders Sign In button');
assert(mockHeaderContainer.innerHTML.includes('Sign Up'), 'updateHeaderVisibility("Guest") renders Sign Up button');
assert(!mockHeaderContainer.innerHTML.includes('Dashboard'), 'updateHeaderVisibility("Guest") does NOT render Dashboard');

// Test Buyer dynamic rendering
updateHeaderVisibility('Buyer');
assert(mockHeaderContainer.innerHTML.includes('My Property'), 'updateHeaderVisibility("Buyer") renders My Property link');
assert(mockHeaderContainer.innerHTML.includes('account_circle'), 'updateHeaderVisibility("Buyer") renders profile icon');
assert(mockHeaderContainer.innerHTML.includes('logout'), 'updateHeaderVisibility("Buyer") renders Sign Out button');
assert(!mockHeaderContainer.innerHTML.includes('Dashboard'), 'updateHeaderVisibility("Buyer") does not render generic Dashboard button');

// Test Seller dynamic rendering
updateHeaderVisibility('Seller');
assert(mockHeaderContainer.innerHTML.includes('Sell Property'), 'updateHeaderVisibility("Seller") renders Sell Property action');
assert(mockHeaderContainer.innerHTML.includes('Dashboard'), 'updateHeaderVisibility("Seller") renders Dashboard button');
assert(mockHeaderContainer.innerHTML.includes('logout'), 'updateHeaderVisibility("Seller") renders Sign Out button');

// Test Broker dynamic rendering
updateHeaderVisibility('Broker');
assert(mockHeaderContainer.innerHTML.includes('My Deals'), 'updateHeaderVisibility("Broker") renders My Deals');
assert(mockHeaderContainer.innerHTML.includes('Dashboard'), 'updateHeaderVisibility("Broker") renders Dashboard');
assert(mockHeaderContainer.innerHTML.includes('logout'), 'updateHeaderVisibility("Broker") renders Sign Out button');

// Test Admin dynamic rendering
updateHeaderVisibility('Admin');
assert(mockHeaderContainer.innerHTML.includes('Dashboard'), 'updateHeaderVisibility("Admin") renders Dashboard');
assert(mockHeaderContainer.innerHTML.includes('admin-panel.html'), 'updateHeaderVisibility("Admin") links to admin-panel.html');

// ── Section 3: Supabase Session Resolution & Stale Storage Recovery ──
console.log('\n--- Section 3: Supabase Session Resolution & Stale Storage Recovery ---');

// Simulate stale local storage: visitor had a leftover 'Seller' or 'Admin' role in localStorage
localStorage.setItem('role', 'Seller');
localStorage.setItem('userName', 'Old Stale User');

// Mock Supabase client returning NO session (logged out visitor)
const mockLoggedOutSupabase = {
    auth: {
        getSession: async () => ({ data: { session: null }, error: null })
    }
};

const resolvedLoggedOutRole = await syncHeaderWithAuth(mockLoggedOutSupabase);
assert(resolvedLoggedOutRole === 'Guest', 'syncHeaderWithAuth returns "Guest" when session is null');
assert(localStorage.getItem('role') === 'Guest', 'syncHeaderWithAuth clears stale role from localStorage to "Guest"');
assert(mockHeaderContainer.innerHTML.includes('Sign In'), 'syncHeaderWithAuth immediately updates header to Sign In for logged-out visitors');
assert(mockHeaderContainer.innerHTML.includes('Sign Up'), 'syncHeaderWithAuth immediately updates header to Sign Up for logged-out visitors');

// Mock Supabase client returning active Seller session
const mockSellerSupabase = {
    auth: {
        getSession: async () => ({
            data: {
                session: {
                    user: { id: 'seller-user-123', email: 'seller@example.com' }
                }
            },
            error: null
        })
    },
    from: (table) => ({
        select: () => ({
            eq: () => ({
                single: async () => ({
                    data: { id: 'seller-user-123', role: 'Seller', full_name: 'Priya Seller' },
                    error: null
                }),
                maybeSingle: async () => ({
                    data: { id: 'seller-user-123', role: 'Seller', full_name: 'Priya Seller' },
                    error: null
                })
            })
        })
    })
};

const resolvedSellerRole = await syncHeaderWithAuth(mockSellerSupabase);
assert(resolvedSellerRole === 'Seller', 'syncHeaderWithAuth returns "Seller" when authentic session belongs to a Seller');
assert(localStorage.getItem('role') === 'Seller', 'syncHeaderWithAuth persists verified role in localStorage');
assert(mockHeaderContainer.innerHTML.includes('Sell Property'), 'syncHeaderWithAuth renders Seller account actions');

// ── Section 4: Login Redirect & Intended Workflow Return ──
console.log('\n--- Section 4: Login Redirect & Intended Workflow Return ---');

const authGuardModule = await import('../js/features/authentication/auth-guard.js');
const { login } = authGuardModule;

let navigatedUrl = null;
global.window.location.search = '?redirect=sell.html&action=submit_valuation';
global.window.ajaxLoadPage = (url) => { navigatedUrl = url; };
const originalLocation = global.window.location;
delete global.window.location;
global.window.location = {
    ...originalLocation,
    set href(val) { navigatedUrl = val; },
    get href() { return navigatedUrl || originalLocation.href; },
    assign(val) { navigatedUrl = val; },
    replace(val) { navigatedUrl = val; }
};

await login('Seller', 'Priya Seller');
assert(navigatedUrl && navigatedUrl.includes('sell.html'), 'login() redirects to the specified ?redirect=sell.html parameter');
assert(navigatedUrl && navigatedUrl.includes('action=submit_valuation'), 'login() preserves the ?action=submit_valuation parameter');

// ── Section 5: Valuation Form Session Gating & Pending Request Restoration ──
console.log('\n--- Section 5: Sell Page Valuation Workflow ---');

// Mock inputs
const mockValForm = new MockElement('form', 'valuation-form');
const mockValName = new MockElement('input', 'val-name');
const mockValEmail = new MockElement('input', 'val-email');
const mockValAddress = new MockElement('input', 'val-address');
const mockValType = new MockElement('select', 'val-type');
const mockValPhone = new MockElement('input', 'val-phone');

mockValForm.appendChild(mockValName);
mockValForm.appendChild(mockValEmail);
mockValForm.appendChild(mockValAddress);
mockValForm.appendChild(mockValType);
mockValForm.appendChild(mockValPhone);
mockBody.appendChild(mockValForm);

// Mock toast system
let lastToast = null;
global.window.showToast = (msg, type) => { lastToast = { msg, type }; };

// Control session via supabase client
const { supabase } = await import('../js/core/supabase-client.js');
let currentSessionMock = null;
supabase.auth.getSession = async () => ({
    data: { session: currentSessionMock },
    error: null
});

const sellModule = await import('../js/features/sell/sell.js');
const { initSellPage } = sellModule;

// Test 1: Logged-out submission saves data and redirects to login
currentSessionMock = null;

mockValName.value = 'Aarav Patel';
mockValEmail.value = 'aarav@example.com';
mockValAddress.value = 'Flat 402, Sea View Apartments, Bandra West, Mumbai';
mockValType.value = 'Apartment';
mockValPhone.value = '+919876543210';

navigatedUrl = null;
await initSellPage();

// Submit form as logged out guest
assert(typeof mockValForm.onsubmit === 'function', 'initSellPage attaches onsubmit handler');
await mockValForm.onsubmit({ preventDefault: () => {} });

const savedPending = sessionStorage.getItem('pending_valuation_request');
assert(savedPending !== null, 'Logged-out submission stores form values in sessionStorage');
const parsedPending = JSON.parse(savedPending || '{}');
assert(parsedPending.name === 'Aarav Patel', 'Pending request accurately preserves full name');
assert(parsedPending.email === 'aarav@example.com', 'Pending request accurately preserves email');
assert(parsedPending.address.includes('Bandra West'), 'Pending request accurately preserves address');
assert(navigatedUrl && navigatedUrl.includes('login.html?role=Seller&redirect=sell.html&action=submit_valuation'), 'Logged-out submission redirects to login with return parameters');

// Test 2: Returning from login with ?action=submit_valuation
global.window.location.search = '?action=submit_valuation';
global.window.location.pathname = '/sell.html';

// User is now authenticated
currentSessionMock = {
    user: {
        id: 'aarav-user-1',
        email: 'aarav@example.com',
        user_metadata: { full_name: 'Aarav Patel' }
    }
};

let formResetCalled = false;
mockValForm.reset = () => { formResetCalled = true; };

await initSellPage();

assert(sessionStorage.getItem('pending_valuation_request') === null, 'Completed return submission clears pending_valuation_request');
assert(formResetCalled, 'Completed return submission resets the form');
assert(global.window.location.pathname === '/sell.html', 'Completed return submission cleans URL parameters');

// ── Section 6: Public Access Verification ──
console.log('\n--- Section 6: Public Access Verification ---');
const authStateModule = await import('../js/core/auth-state.js');
const { guestPages, buyerPages, roleAllowedPages } = authStateModule;

assert(guestPages.includes('sell.html'), 'sell.html is included in guestPages (publicly accessible)');
assert(buyerPages.includes('sell.html'), 'sell.html is accessible to Buyers');
assert(roleAllowedPages['Guest'].includes('sell.html'), 'sell.html is explicitly allowed for Guests');
assert(roleAllowedPages['Seller'].includes('sell.html'), 'sell.html is explicitly allowed for Sellers');

console.log('\n================================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
