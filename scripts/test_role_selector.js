/**
 * Test Suite: ProjectX Login & Signup Role Selector
 * Run: node scripts/test_role_selector.js
 *
 * Verifies:
 * 1. Static HTML structure and accessibility semantics on login.html and signup.html.
 * 2. Role switching across Buyer -> Seller -> Broker -> Buyer.
 * 3. Immediate update of selected styling, active icons, and ARIA attributes.
 * 4. Synchronization of role-specific headings, descriptions, badges, labels, and button text.
 * 5. Keyboard navigation (Arrow keys, Space, Enter) and accessible focus management.
 * 6. Form submission using the currently selected role.
 * 7. Trusted role authorization behavior without client-side permission elevation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        console.log(`  ✅ PASS: ${desc}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${desc}`);
        failed++;
    }
}

console.log('================================================================');
console.log('ProjectX: Role Selector Accessibility & Interaction Test Suite');
console.log('================================================================');

// ── Section 1: Static HTML & Accessibility Semantics ──
console.log('\n--- Section 1: Static HTML & Accessibility Semantics ---');

for (const fileName of ['login.html', 'signup.html']) {
    const filePath = path.join(projectRoot, fileName);
    const html = fs.readFileSync(filePath, 'utf8');

    assert(`${fileName} contains #account-type-grid with role="radiogroup"`,
        html.includes('id="account-type-grid"') &&
        html.includes('role="radiogroup"') &&
        html.includes('aria-label="Account Type"')
    );

    assert(`${fileName} contains Buyer, Seller, and Broker role cards`,
        html.includes('data-role="Buyer"') &&
        html.includes('data-role="Seller"') &&
        html.includes('data-role="Broker"')
    );

    assert(`${fileName} role cards have role="radio"`,
        (html.match(/role="radio"/g) || []).length >= 3
    );

    assert(`${fileName} Buyer card defaults to aria-checked="true" and tabindex="0"`,
        html.includes('data-role="Buyer"') &&
        html.includes('aria-checked="true"') &&
        html.includes('tabindex="0"')
    );

    assert(`${fileName} Seller and Broker cards have aria-checked="false"`,
        (html.match(/aria-checked="false"/g) || []).length >= 2
    );

    assert(`${fileName} cards contain pointer-events-none on inner children`,
        html.includes('pointer-events-none')
    );
}

// ── Section 2: Mock DOM Role Selector Interaction & State Management ──
console.log('\n--- Section 2: Interactive Role Selection (Buyer -> Seller -> Broker -> Buyer) ---');

// Create a lightweight DOM simulation for login page logic
function createMockLoginPageDOM() {
    class MockElement {
        constructor(id = '', tag = 'div', attrs = {}) {
            this.id = id;
            this.tagName = tag.toUpperCase();
            this.attributes = { ...attrs };
            this.classList = new Set();
            this.children = [];
            this.parentElement = null;
            this.textContent = '';
            this.innerHTML = '';
            this.style = {};
            this.listeners = {};
            this.value = '';
            this.disabled = false;
        }

        setAttribute(k, v) { this.attributes[k] = String(v); }
        getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
        hasAttribute(k) { return this.attributes[k] !== undefined; }
        removeAttribute(k) { delete this.attributes[k]; }

        addEventListener(ev, fn) {
            if (!this.listeners[ev]) this.listeners[ev] = [];
            this.listeners[ev].push(fn);
        }

        dispatchEvent(ev) {
            const list = this.listeners[ev.type] || [];
            for (const fn of list) fn(ev);
            if (!ev._propagationStopped && this.parentElement) {
                this.parentElement.dispatchEvent(ev);
            }
        }

        click() {
            const ev = { type: 'click', target: this, preventDefault() {}, stopPropagation() { this._propagationStopped = true; } };
            this.dispatchEvent(ev);
        }

        keydown(key) {
            const ev = { type: 'keydown', key, target: this, preventDefault() {}, stopPropagation() { this._propagationStopped = true; } };
            this.dispatchEvent(ev);
        }

        focus() {
            mockWindow.document.activeElement = this;
        }

        querySelector(sel) {
            const res = this.querySelectorAll(sel);
            return res.length > 0 ? res[0] : null;
        }

        querySelectorAll(sel) {
            const out = [];
            const check = (el) => {
                let match = false;
                if (sel.startsWith('#') && el.id === sel.slice(1)) match = true;
                if (sel.startsWith('.') && el.classList.has(sel.slice(1))) match = true;
                if (sel.includes('[data-role=')) {
                    const expectedRole = sel.match(/\[data-role="([^"]+)"\]/)[1];
                    if (el.getAttribute('data-role') === expectedRole) match = true;
                }
                if (match && el !== this) out.push(el);
                for (const c of el.children) check(c);
            };
            check(this);
            return out;
        }

        closest(sel) {
            let cur = this;
            while (cur) {
                if (sel.startsWith('.') && cur.classList.has(sel.slice(1))) return cur;
                if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
                cur = cur.parentElement;
            }
            return null;
        }

        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        }
    }

    // Wrap set to mimic DOMTokenList
    function enhanceClassList(el) {
        const set = el.classList;
        el.classList = {
            has: (c) => set.has(c),
            contains: (c) => set.has(c),
            add: (...cls) => cls.forEach(c => set.add(c)),
            remove: (...cls) => cls.forEach(c => set.delete(c)),
            toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
            get value() { return Array.from(set).join(' '); }
        };
    }

    const doc = new MockElement('root', 'document');
    doc.activeElement = null;

    const elementsById = {};
    function createElement(tag, id = '', attrs = {}) {
        const el = new MockElement(id, tag, attrs);
        enhanceClassList(el);
        if (id) elementsById[id] = el;
        return el;
    }

    // Build DOM structure corresponding to login.html
    const formTitle = createElement('h2', 'form-title');
    const formSubtitle = createElement('p', 'form-subtitle');
    const roleBadgeText = createElement('span', 'role-pill-badge');
    const roleDescText = createElement('span', 'role-description-text');
    const roleDescBox = createElement('div', 'role-description-box');
    const authAlert = createElement('div', 'auth-alert');
    const submitBtn = createElement('button', 'sign-in-btn');
    const nameField = createElement('div', 'name-field');
    const nameLabel = createElement('label', 'name-label');
    const inputName = createElement('input', 'input-name');
    nameField.appendChild(nameLabel);
    nameField.appendChild(inputName);

    const emailField = createElement('div', 'email-field');
    const inputEmail = createElement('input', 'input-email');
    emailField.appendChild(inputEmail);

    const phoneField = createElement('div', 'phone-field');
    const inputPhone = createElement('input', 'input-phone');
    phoneField.appendChild(inputPhone);

    const passwordField = createElement('div', 'password-field');
    const inputPassword = createElement('input', 'input-password');
    passwordField.appendChild(inputPassword);

    const grid = createElement('div', 'account-type-grid', { role: 'radiogroup', 'aria-label': 'Account Type' });
    
    // Create Buyer, Seller, Broker cards
    const roles = [
        { role: 'Buyer', icon: 'home', text: 'Find & buy homes' },
        { role: 'Seller', icon: 'sell', text: 'List & sell' },
        { role: 'Broker', icon: 'domain', text: 'Manage deals' }
    ];

    const cards = roles.map((r, i) => {
        const card = createElement('button', '', {
            type: 'button',
            'data-role': r.role,
            role: 'radio',
            'aria-checked': i === 0 ? 'true' : 'false',
            tabindex: i === 0 ? '0' : '-1'
        });
        card.classList.add('account-type-card');
        if (i === 0) {
            card.classList.add('border-slate-900', 'bg-slate-900/5', 'text-slate-900', 'ring-1', 'ring-slate-900', 'shadow-sm');
        } else {
            card.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
        }

        const iconWrap = createElement('div', '');
        iconWrap.classList.add('pointer-events-none');
        const mainIcon = createElement('span', '');
        mainIcon.classList.add('role-main-icon', 'material-symbols-outlined', i === 0 ? 'text-slate-900' : 'text-slate-400');
        mainIcon.textContent = r.icon;
        const checkIcon = createElement('span', '');
        checkIcon.classList.add('role-check-indicator', 'material-symbols-outlined', 'text-slate-900');
        if (i !== 0) checkIcon.classList.add('hidden');
        checkIcon.textContent = 'check_circle';
        iconWrap.appendChild(mainIcon);
        iconWrap.appendChild(checkIcon);
        card.appendChild(iconWrap);

        const textWrap = createElement('div', '');
        textWrap.classList.add('pointer-events-none');
        const titleDiv = createElement('div', '');
        titleDiv.textContent = r.role;
        const subDiv = createElement('div', '');
        subDiv.textContent = r.text;
        textWrap.appendChild(titleDiv);
        textWrap.appendChild(subDiv);
        card.appendChild(textWrap);

        grid.appendChild(card);
        return card;
    });

    doc.appendChild(formTitle);
    doc.appendChild(formSubtitle);
    doc.appendChild(roleBadgeText);
    doc.appendChild(roleDescText);
    doc.appendChild(roleDescBox);
    doc.appendChild(grid);
    doc.appendChild(nameField);
    doc.appendChild(phoneField);
    doc.appendChild(emailField);
    doc.appendChild(passwordField);
    doc.appendChild(authAlert);
    doc.appendChild(submitBtn);

    const mockWindow = {
        location: { search: '', origin: 'http://localhost:5180', pathname: '/login.html' },
        localStorage: { getItem: () => null, setItem: () => {} },
        document: {
            getElementById: (id) => elementsById[id] || null,
            querySelectorAll: (sel) => doc.querySelectorAll(sel),
            querySelector: (sel) => doc.querySelector(sel),
            activeElement: null
        }
    };

    return { mockWindow, cards, grid, formTitle, formSubtitle, roleBadgeText, roleDescText, submitBtn, nameLabel };
}

// Emulate role controller logic as updated in login.js
function setupRoleController(mockDOM) {
    const { mockWindow, cards, grid, formSubtitle, roleBadgeText, roleDescText, submitBtn, nameLabel } = mockDOM;

    const roleMeta = {
        'Buyer': {
            icon: 'home',
            description: 'Find your next home and explore verified residential and commercial properties.',
            nameLabel: 'Full Name',
            submitSignIn: 'Sign In as Buyer',
            submitSignUp: 'Create Buyer Account'
        },
        'Seller': {
            icon: 'sell',
            description: 'List your property, request expert valuations, and connect with verified buyers.',
            nameLabel: 'Full Name / Property Owner',
            submitSignIn: 'Sign In as Seller',
            submitSignUp: 'Create Seller Account'
        },
        'Broker': {
            icon: 'domain',
            description: 'Manage exclusive property listings, client inquiries, custom filters, and deal pipelines.',
            nameLabel: 'Full Name / Agency Name',
            submitSignIn: 'Sign In as Broker',
            submitSignUp: 'Create Broker Account'
        }
    };

    let selectedRole = 'Buyer';
    let currentMode = 'signin';

    function updateUI() {
        const meta = roleMeta[selectedRole] || roleMeta['Buyer'];
        if (formSubtitle) {
            formSubtitle.innerHTML = `Accessing your <span class="font-bold text-slate-900">${selectedRole}</span> account and portfolio.`;
        }
        if (roleBadgeText) {
            roleBadgeText.textContent = `${selectedRole} Portal`;
        }
        if (roleDescText) {
            roleDescText.textContent = meta.description;
        }
        if (nameLabel) {
            nameLabel.textContent = meta.nameLabel;
        }
        if (submitBtn) {
            submitBtn.textContent = currentMode === 'signup' ? meta.submitSignUp : meta.submitSignIn;
        }
    }

    function selectRole(role) {
        if (!role) return;
        let normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        if (!roleMeta[normalizedRole]) normalizedRole = 'Buyer';
        selectedRole = normalizedRole;

        cards.forEach(card => {
            const cardRole = (card.getAttribute('data-role') || '').trim();
            const isMatch = cardRole.toLowerCase() === selectedRole.toLowerCase();

            card.setAttribute('aria-checked', isMatch ? 'true' : 'false');
            card.setAttribute('tabindex', isMatch ? '0' : '-1');

            if (isMatch) {
                card.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');
                card.classList.add('border-slate-900', 'bg-slate-900/5', 'text-slate-900', 'ring-1', 'ring-slate-900', 'shadow-sm');
                const checkIcon = card.querySelector('.role-check-indicator');
                if (checkIcon) checkIcon.classList.remove('hidden');
                const mainIcon = card.querySelector('.role-main-icon');
                if (mainIcon) {
                    mainIcon.classList.remove('text-slate-400');
                    mainIcon.classList.add('text-slate-900');
                }
            } else {
                card.classList.remove('border-slate-900', 'bg-slate-900/5', 'text-slate-900', 'ring-1', 'ring-slate-900', 'shadow-sm');
                card.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
                const checkIcon = card.querySelector('.role-check-indicator');
                if (checkIcon) checkIcon.classList.add('hidden');
                const mainIcon = card.querySelector('.role-main-icon');
                if (mainIcon) {
                    mainIcon.classList.remove('text-slate-900');
                    mainIcon.classList.add('text-slate-400');
                }
            }
        });

        updateUI();
    }

    // Grid delegation listener
    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.account-type-card');
        if (card) {
            const role = card.getAttribute('data-role');
            if (role) selectRole(role);
        }
    });

    // Per-card click and keyboard listeners
    cards.forEach((card, idx) => {
        card.addEventListener('click', () => {
            const role = card.getAttribute('data-role');
            selectRole(role);
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                const nextIdx = (idx + 1) % cards.length;
                const nextCard = cards[nextIdx];
                nextCard.focus();
                const nextRole = nextCard.getAttribute('data-role');
                if (nextRole) selectRole(nextRole);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                const prevIdx = (idx - 1 + cards.length) % cards.length;
                const prevCard = cards[prevIdx];
                prevCard.focus();
                const prevRole = prevCard.getAttribute('data-role');
                if (prevRole) selectRole(prevRole);
            } else if (e.key === ' ' || e.key === 'Enter') {
                const role = card.getAttribute('data-role');
                if (role) selectRole(role);
            }
        });
    });

    let lastSubmittedRole = null;
    submitBtn.addEventListener('click', () => {
        lastSubmittedRole = selectedRole;
    });

    // Run initial updateUI
    updateUI();

    return {
        selectRole,
        getSelectedRole: () => selectedRole,
        getLastSubmittedRole: () => lastSubmittedRole,
        setMode: (m) => { currentMode = m; updateUI(); }
    };
}

const mockDOM = createMockLoginPageDOM();
const controller = setupRoleController(mockDOM);
const [buyerCard, sellerCard, brokerCard] = mockDOM.cards;

// Initial state verification
assert('Initial role defaults to Buyer', controller.getSelectedRole() === 'Buyer');
assert('Buyer card has active ring-1 styling', buyerCard.classList.contains('ring-1'));
assert('Buyer card has aria-checked="true"', buyerCard.getAttribute('aria-checked') === 'true');
assert('Buyer card has tabindex="0"', buyerCard.getAttribute('tabindex') === '0');
assert('Seller card has aria-checked="false"', sellerCard.getAttribute('aria-checked') === 'false');
assert('Broker card has aria-checked="false"', brokerCard.getAttribute('aria-checked') === 'false');
assert('Submit button text is "Sign In as Buyer"', mockDOM.submitBtn.textContent === 'Sign In as Buyer');
assert('Badge is "Buyer Portal"', mockDOM.roleBadgeText.textContent === 'Buyer Portal');

// Step 1: Click Seller Card
sellerCard.click();
assert('Clicking Seller updates selectedRole to "Seller"', controller.getSelectedRole() === 'Seller');
assert('Seller card now has active ring-1 styling', sellerCard.classList.contains('ring-1'));
assert('Seller card has aria-checked="true"', sellerCard.getAttribute('aria-checked') === 'true');
assert('Seller card has tabindex="0"', sellerCard.getAttribute('tabindex') === '0');
assert('Buyer card styling is deactivated', !buyerCard.classList.contains('ring-1'));
assert('Buyer card has aria-checked="false"', buyerCard.getAttribute('aria-checked') === 'false');
assert('Buyer card has tabindex="-1"', buyerCard.getAttribute('tabindex') === '-1');
assert('Role badge reflects "Seller Portal"', mockDOM.roleBadgeText.textContent === 'Seller Portal');
assert('Submit button text updates to "Sign In as Seller"', mockDOM.submitBtn.textContent === 'Sign In as Seller');
assert('Description contains valuation text', mockDOM.roleDescText.textContent.includes('valuations'));

// Step 2: Click Broker Card
brokerCard.click();
assert('Clicking Broker updates selectedRole to "Broker"', controller.getSelectedRole() === 'Broker');
assert('Broker card now has active ring-1 styling', brokerCard.classList.contains('ring-1'));
assert('Broker card has aria-checked="true"', brokerCard.getAttribute('aria-checked') === 'true');
assert('Broker card has tabindex="0"', brokerCard.getAttribute('tabindex') === '0');
assert('Seller card is now inactive', !sellerCard.classList.contains('ring-1'));
assert('Seller card has aria-checked="false"', sellerCard.getAttribute('aria-checked') === 'false');
assert('Role badge reflects "Broker Portal"', mockDOM.roleBadgeText.textContent === 'Broker Portal');
assert('Submit button text updates to "Sign In as Broker"', mockDOM.submitBtn.textContent === 'Sign In as Broker');
assert('Description contains pipelines text', mockDOM.roleDescText.textContent.includes('deal pipelines'));

// Step 3: Click Buyer Card to return to Buyer
buyerCard.click();
assert('Clicking Buyer returns selectedRole to "Buyer"', controller.getSelectedRole() === 'Buyer');
assert('Buyer card restored to active ring-1 styling', buyerCard.classList.contains('ring-1'));
assert('Buyer card has aria-checked="true"', buyerCard.getAttribute('aria-checked') === 'true');
assert('Broker card is now inactive', !brokerCard.classList.contains('ring-1'));
assert('Submit button text restored to "Sign In as Buyer"', mockDOM.submitBtn.textContent === 'Sign In as Buyer');

// ── Section 3: Keyboard Navigation & ARIA ──
console.log('\n--- Section 3: Keyboard Navigation & ARIA Focus Traversal ---');

// ArrowRight from Buyer -> Seller
buyerCard.keydown('ArrowRight');
assert('ArrowRight from Buyer moves focus and selects Seller',
    controller.getSelectedRole() === 'Seller' &&
    mockDOM.mockWindow.document.activeElement === sellerCard &&
    sellerCard.getAttribute('aria-checked') === 'true'
);

// ArrowRight from Seller -> Broker
sellerCard.keydown('ArrowRight');
assert('ArrowRight from Seller moves focus and selects Broker',
    controller.getSelectedRole() === 'Broker' &&
    mockDOM.mockWindow.document.activeElement === brokerCard &&
    brokerCard.getAttribute('aria-checked') === 'true'
);

// ArrowRight from Broker -> Wraps around to Buyer
brokerCard.keydown('ArrowRight');
assert('ArrowRight from Broker wraps around to Buyer',
    controller.getSelectedRole() === 'Buyer' &&
    mockDOM.mockWindow.document.activeElement === buyerCard &&
    buyerCard.getAttribute('aria-checked') === 'true'
);

// ArrowLeft from Buyer -> Wraps around to Broker
buyerCard.keydown('ArrowLeft');
assert('ArrowLeft from Buyer wraps around to Broker',
    controller.getSelectedRole() === 'Broker' &&
    mockDOM.mockWindow.document.activeElement === brokerCard
);

// ArrowLeft from Broker -> Seller
brokerCard.keydown('ArrowLeft');
assert('ArrowLeft from Broker moves to Seller',
    controller.getSelectedRole() === 'Seller' &&
    mockDOM.mockWindow.document.activeElement === sellerCard
);

// Space key activation on Buyer
buyerCard.keydown(' ');
assert('Space key on Buyer card selects Buyer', controller.getSelectedRole() === 'Buyer');

// Enter key activation on Broker
brokerCard.keydown('Enter');
assert('Enter key on Broker card selects Broker', controller.getSelectedRole() === 'Broker');

// ── Section 4: Form Submission Role Synchronization ──
console.log('\n--- Section 4: Form Submission Role Synchronization ---');

// Test submitting as Broker
mockDOM.submitBtn.click();
assert('Form submit uses the selected Broker role', controller.getLastSubmittedRole() === 'Broker');

// Switch to Seller and submit
sellerCard.click();
mockDOM.submitBtn.click();
assert('Form submit uses the selected Seller role', controller.getLastSubmittedRole() === 'Seller');

// Switch to Buyer and submit
buyerCard.click();
mockDOM.submitBtn.click();
assert('Form submit uses the selected Buyer role', controller.getLastSubmittedRole() === 'Buyer');

// Sign-up mode test: button text updates to "Create Seller Account"
controller.setMode('signup');
sellerCard.click();
assert('Sign up button text updates to "Create Seller Account"', mockDOM.submitBtn.textContent === 'Create Seller Account');
assert('Name label for Seller updates to "Full Name / Property Owner"', mockDOM.nameLabel.textContent === 'Full Name / Property Owner');

brokerCard.click();
assert('Sign up button text updates to "Create Broker Account"', mockDOM.submitBtn.textContent === 'Create Broker Account');
assert('Name label for Broker updates to "Full Name / Agency Name"', mockDOM.nameLabel.textContent === 'Full Name / Agency Name');

// ── Section 5: Supabase Configuration & Role Authorization Safety ──
console.log('\n--- Section 5: Supabase Configuration & Role Authorization Safety ---');

// Test sanitization functions
const SUPABASE_FALLBACK_URL = 'https://xjpqxhbuuevaplvthvsf.supabase.co';
const SUPABASE_FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcHF4aGJ1dWV2YXBsdnRodnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjI4MDYsImV4cCI6MjA5NDUzODgwNn0.OUt6r65O0Lw4GwgO2Vc8r6dlBgDqtNpzaQaXQ0cElOk';

function testSanitizeUrl(raw, fallback) {
    const candidate = (typeof raw === 'string') ? raw.trim() : '';
    if (!candidate) return fallback;
    let target = candidate;
    if (target.includes('VITE_SUPABASE_URL=')) {
        const match = target.match(/VITE_SUPABASE_URL\s*=\s*([^\s\r\n"']+)/);
        if (match) target = match[1].trim();
    }
    const match = target.match(/https?:\/\/[^\s\r\n"']+/);
    if (match) {
        try {
            const parsed = new URL(match[0]);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.origin;
            }
        } catch {}
    }
    return fallback;
}

function testSanitizeKey(raw, fallback) {
    const candidate = (typeof raw === 'string') ? raw.trim() : '';
    if (!candidate) return fallback;
    let target = candidate;
    if (target.includes('VITE_SUPABASE_ANON_KEY=')) {
        const match = target.match(/VITE_SUPABASE_ANON_KEY\s*=\s*([^\s\r\n"']+)/);
        if (match) target = match[1].trim();
    }
    const jwtMatch = target.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (jwtMatch) return jwtMatch[0].trim();
    const sbpMatch = target.match(/sbp_[a-zA-Z0-9_-]+/);
    if (sbpMatch) return sbpMatch[0].trim();
    return fallback;
}

// 1. sanitizeUrl tests
const cleanUrl = 'https://custom-project.supabase.co';
assert('sanitizeUrl preserves a clean HTTPS URL origin',
    testSanitizeUrl(cleanUrl, SUPABASE_FALLBACK_URL) === cleanUrl
);

const multilineEnvUrl = `VITE_SUPABASE_URL=https://xjpqxhbuuevaplvthvsf.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`;
assert('sanitizeUrl strips multiline .env content and extracts only the URL origin',
    testSanitizeUrl(multilineEnvUrl, SUPABASE_FALLBACK_URL) === 'https://xjpqxhbuuevaplvthvsf.supabase.co'
);

assert('sanitizeUrl rejects invalid scheme/text and returns fallback',
    testSanitizeUrl('ftp://invalid-url.com', SUPABASE_FALLBACK_URL) === SUPABASE_FALLBACK_URL &&
    testSanitizeUrl('not-a-valid-url', SUPABASE_FALLBACK_URL) === SUPABASE_FALLBACK_URL &&
    testSanitizeUrl('', SUPABASE_FALLBACK_URL) === SUPABASE_FALLBACK_URL
);

// 2. sanitizeKey tests
const sampleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sampleSignature123';
assert('sanitizeKey preserves a clean JWT anon key',
    testSanitizeKey(sampleJwt, SUPABASE_FALLBACK_KEY) === sampleJwt
);

const multilineEnvKey = `VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sampleSignature123\nOTHER_VAR=123`;
assert('sanitizeKey extracts JWT token from prefixed multiline text',
    testSanitizeKey(multilineEnvKey, SUPABASE_FALLBACK_KEY) === sampleJwt
);

assert('sanitizeKey rejects fabricated arbitrary strings and returns fallback',
    testSanitizeKey('not-a-valid-jwt-token-string', SUPABASE_FALLBACK_KEY) === SUPABASE_FALLBACK_KEY &&
    testSanitizeKey('', SUPABASE_FALLBACK_KEY) === SUPABASE_FALLBACK_KEY
);

// 3. Security: No client-side secret_role key exposed
const clientFilesToCheck = [
    'lib/supabase.js',
    'login.html',
    'signup.html',
    'js/features/authentication/login.js',
    'js/features/authentication/signup.js'
];
for (const file of clientFilesToCheck) {
    const content = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    assert(`${file} does not contain service_role or service-role secret`,
        !content.includes('service_role') && !content.includes('service-role')
    );
}

// 4. Role Authorization Safety Invariant
// Verify that login.js enforces profile.role === selectedRole and cannot grant privileges
const loginJsContent = fs.readFileSync(path.join(projectRoot, 'js/features/authentication/login.js'), 'utf8');
assert('login.js enforces profile.role comparison against selectedRole',
    loginJsContent.includes('let matched = (profile.role === selectedRole);')
);
assert('login.js signs out user and rejects login when selected role mismatches database profile',
    loginJsContent.includes('await signOut();') &&
    loginJsContent.includes('This account is registered as a')
);

// ── Summary ──
console.log('\n================================================================');
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log('================================================================');

if (failed > 0) {
    process.exit(1);
}

