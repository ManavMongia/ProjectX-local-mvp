/**
 * Navigation UI Component
 * Handles header trailing actions based on auth role, touch dropdowns, and link normalizations.
 */

import { toAppUrl } from '../core/router.js';
import { roleHomePage } from '../core/auth-state.js';

export function updateHeaderVisibility() {
    let currentRoleRaw = localStorage.getItem('role') || 'Guest';
    let currentRole = currentRoleRaw;
    if (currentRoleRaw) {
        currentRole = currentRoleRaw.charAt(0).toUpperCase() + currentRoleRaw.slice(1).toLowerCase();
    }
    
    // Find all trailing actions containers
    const containers = [];
    const accountIcons = document.querySelectorAll('.material-symbols-outlined');
    accountIcons.forEach(el => {
        if (el.textContent.trim() === 'account_circle' || el.textContent.trim() === 'logout') {
            const c = el.closest('.items-center.gap-4') || el.closest('#mobile-trailing-actions');
            if (c && !containers.includes(c)) containers.push(c);
        }
    });
    
    // Fallback query if standard icon isn't found
    if (containers.length === 0) {
        const signInBtns = document.querySelectorAll('button, a');
        signInBtns.forEach(el => {
            if (el.textContent.trim().includes('Sign In') || el.textContent.trim().includes('Sign Up')) {
                const c = el.closest('.items-center.gap-4') || el.closest('#mobile-trailing-actions');
                if (c && !containers.includes(c)) containers.push(c);
            }
        });
    }
    
    // Also manually add the mobile container if empty
    const mobileContainer = document.getElementById('mobile-trailing-actions');
    if (mobileContainer && !containers.includes(mobileContainer)) containers.push(mobileContainer);

    containers.forEach(container => {
        const isMobileContainer = container.id === 'mobile-trailing-actions' || container.classList.contains('flex-col');
        
        if (currentRole === 'Guest') {
            if (isMobileContainer) {
                container.innerHTML = `
                    <a href="${toAppUrl('login.html')}" class="w-full text-center border border-slate-200 text-slate-700 px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-50 transition-colors uppercase tracking-wider block">
                        Sign In
                    </a>
                    <a href="${toAppUrl('login.html?mode=signup')}" class="w-full text-center bg-slate-900 text-white px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors uppercase tracking-wider shadow-sm block">
                        Sign Up
                    </a>
                `;
            } else {
                container.innerHTML = `
                    <a href="${toAppUrl('login.html')}" class="text-slate-600 hover:text-slate-900 transition-colors font-bold text-xs uppercase tracking-wider px-3 py-2 inline-block">
                        Sign In
                    </a>
                    <a href="${toAppUrl('login.html?mode=signup')}" class="bg-slate-900 text-white px-5 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors uppercase tracking-wider shadow-sm ml-2 inline-block">
                        Sign Up
                    </a>
                `;
            }
        } else if (currentRole === 'Buyer') {
            if (isMobileContainer) {
                container.innerHTML = `
                    <a href="${toAppUrl('profile.html')}" class="w-full text-center border border-slate-200 text-slate-700 px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-50 transition-colors uppercase tracking-wider flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">account_circle</span>
                        Profile
                    </a>
                    <button onclick="window.logout()" class="w-full text-center bg-slate-100 text-slate-700 px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors uppercase tracking-wider flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">logout</span>
                        Sign Out
                    </button>
                `;
            } else {
                container.innerHTML = `
                    <button onclick="window.location.href=window.toAppUrl('profile.html')" class="text-slate-500 hover:text-slate-900 transition-colors flex items-center" title="Signed in as Buyer — Go to Profile">
                        <span class="material-symbols-outlined text-[24px]">account_circle</span>
                    </button>
                    <button onclick="window.logout()" class="text-slate-500 hover:text-slate-900 transition-colors flex items-center ml-2" title="Sign Out">
                        <span class="material-symbols-outlined text-[24px]">logout</span>
                    </button>
                `;
            }
        } else {
            if (isMobileContainer) {
                container.innerHTML = `
                    <a href="${toAppUrl(roleHomePage[currentRole] || 'index.html')}" class="w-full text-center bg-slate-900 text-white px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-800 transition-colors uppercase tracking-wider shadow-sm flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">dashboard</span>
                        Dashboard
                    </a>
                    <button onclick="window.logout()" class="w-full text-center bg-slate-100 text-slate-700 px-5 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors uppercase tracking-wider flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">logout</span>
                        Sign Out
                    </button>
                `;
            } else {
                container.innerHTML = `
                    <a href="${toAppUrl(roleHomePage[currentRole] || 'index.html')}" class="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors uppercase tracking-wider shadow-sm mr-2 flex items-center">
                        Dashboard
                    </a>
                    <button onclick="window.logout()" class="text-slate-500 hover:text-slate-900 transition-colors flex items-center" title="Signed in as ${currentRole} — Sign Out">
                        <span class="material-symbols-outlined text-[24px]">logout</span>
                    </button>
                `;
            }
        }
    });
}

export function initTouchDropdowns() {
    document.querySelectorAll('.group').forEach(group => {
        const trigger = group.querySelector('button, a');
        const dropdown = group.querySelector('[class*="group-hover"]');
        if (!trigger || !dropdown) return;

        trigger.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isVisible = dropdown.style.opacity === '1';
            // Close all
            document.querySelectorAll('.group [class*="group-hover"]').forEach(d => {
                d.style.opacity = '0';
                d.style.visibility = 'hidden';
                d.style.pointerEvents = 'none';
            });
            // Toggle this one
            if (!isVisible) {
                dropdown.style.opacity = '1';
                dropdown.style.visibility = 'visible';
                dropdown.style.pointerEvents = 'auto';
            }
        });
    });

    // Close on outside touch
    document.addEventListener('touchend', (e) => {
        if (!e.target.closest('.group')) {
            document.querySelectorAll('.group [class*="group-hover"]').forEach(d => {
                d.style.opacity = '0';
                d.style.visibility = 'hidden';
                d.style.pointerEvents = 'none';
            });
        }
    });
}

export function wireCommonLinks() {
    const navMap = {
        'About Us': 'index.html',
        'Terms of Service': 'terms.html',
        'Privacy Policy': 'privacy.html',
        'Cookie Settings': 'privacy.html',
        'Contact Support': 'login.html',
        'Sitemap': 'sitemap.html'
    };

    document.querySelectorAll('a').forEach((a) => {
        const label = a.textContent.trim();
        if (navMap[label]) a.setAttribute('href', toAppUrl(navMap[label]));
    });
}

export function normalizeInternalLinks() {
    document.querySelectorAll('a[href^="/"]').forEach((link) => {
        const href = link.getAttribute('href');
        if (!href || href === '/') {
            link.setAttribute('href', toAppUrl('index.html'));
            return;
        }
        link.setAttribute('href', toAppUrl(href));
    });
}
