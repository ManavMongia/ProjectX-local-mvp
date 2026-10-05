/**
 * SPA / AJAX Router & Navigation
 * Intercepts internal links, performs animated page transitions,
 * and maintains history state.
 */

import { resolveAppBasePath, resolveCurrentPage } from './app-state.js';

let isNavigating = false;
let onPageChangeCallback = null;

// Inject SPA transition CSS once
if (!document.getElementById('spa-transition-style')) {
    const style = document.createElement('style');
    style.id = 'spa-transition-style';
    style.innerHTML = `
        body {
            opacity: 1;
        }
        body.spa-fade {
            transition: opacity 0.15s ease-in-out;
        }
        body.spa-hidden {
            opacity: 0 !important;
        }
    `;
    document.head.appendChild(style);
}

// Global page initialization registry
window.spaPageInit = window.spaPageInit || {};
window.initAppPageHasRun = false;

export function registerPageInit(pageName, initFn) {
    window.spaPageInit[pageName] = initFn;
    const computedPage = resolveCurrentPage();

    if (window.initAppPageHasRun && computedPage === pageName) {
        try {
            initFn();
        } catch (e) {
            console.error(`Error running SPA page initializer for ${pageName}:`, e);
        }
    }
}
window.registerPageInit = registerPageInit;

export function toAppUrl(page) {
    if (!page) return '';
    if (page.startsWith('http')) return page;
    const basePath = resolveAppBasePath();
    if (page.startsWith('/')) return `${basePath}${page.replace(/^\/+/, '')}`;
    return `${basePath}${page}`;
}
window.toAppUrl = toAppUrl;

export function navigateTo(page) {
    const url = toAppUrl(page);
    if (window.ajaxLoadPage) {
        window.ajaxLoadPage(url, true);
    } else {
        window.location.replace(url);
    }
}
window.navigateTo = navigateTo;

export async function syncHead(parsedDoc) {
    const currentHead = document.head;
    const newHead = parsedDoc.head;

    // 1. Sync Stylesheets
    const newStylesheets = Array.from(newHead.querySelectorAll('link[rel="stylesheet"]'));
    newStylesheets.forEach(link => {
        const href = link.getAttribute('href');
        if (href && !currentHead.querySelector(`link[href="${href}"]`)) {
            const newLink = document.createElement('link');
            Array.from(link.attributes).forEach(attr => {
                newLink.setAttribute(attr.name, attr.value);
            });
            currentHead.appendChild(newLink);
        }
    });

    // 2. Load and wait for external scripts in the head (excluding auth.js)
    const newScripts = Array.from(newHead.querySelectorAll('script[src]'));
    const loadPromises = [];

    newScripts.forEach(script => {
        const src = script.getAttribute('src');
        if (src) {
            if (src.includes('auth.js')) return; // ignore auth.js
            
            if (!currentHead.querySelector(`script[src="${src}"]`)) {
                const newScript = document.createElement('script');
                Array.from(script.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });

                const promise = new Promise((resolve) => {
                    newScript.onload = () => resolve();
                    newScript.onerror = () => {
                        console.warn(`Failed to load script: ${src}`);
                        resolve();
                    };
                });
                loadPromises.push(promise);
                currentHead.appendChild(newScript);
            }
        }
    });

    // 3. Run inline head scripts
    const inlineHeadScripts = Array.from(newHead.querySelectorAll('script:not([src])'));
    inlineHeadScripts.forEach(script => {
        const newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        currentHead.appendChild(newScript);
    });

    if (loadPromises.length > 0) {
        await Promise.all(loadPromises);
    }
}

export function executeScripts(container) {
    const scripts = Array.from(container.querySelectorAll('script'));
    scripts.forEach(oldScript => {
        const src = oldScript.getAttribute('src');
        if (src && src.includes('auth.js')) return; // ignore auth.js
        
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
        });

        if (oldScript.src) {
            newScript.src = oldScript.src;
        } else {
            newScript.textContent = oldScript.textContent;
        }

        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

export async function ajaxLoadPage(url, replaceState = false) {
    if (isNavigating) return;
    isNavigating = true;
    window.initAppPageHasRun = false;

    // Create or find Progress Bar
    let progressBar = document.getElementById('spa-progress-bar');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'spa-progress-bar';
        progressBar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg, #0f172a, #3b82f6, #0f172a);z-index:99999;width:0%;transition:width 0.2s ease, opacity 0.2s ease;';
        document.body.appendChild(progressBar);
    }
    progressBar.style.opacity = '1';
    progressBar.style.width = '0%';
    setTimeout(() => { if (isNavigating) progressBar.style.width = '30%'; }, 50);
    setTimeout(() => { if (isNavigating) progressBar.style.width = '60%'; }, 200);

    // Fade out current body
    document.body.classList.add('spa-fade', 'spa-hidden');

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const htmlText = await response.text();
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(htmlText, 'text/html');

        progressBar.style.width = '90%';
        await new Promise(resolve => setTimeout(resolve, 150));

        await syncHead(parsedDoc);

        document.body.className = parsedDoc.body.className;
        document.body.innerHTML = parsedDoc.body.innerHTML;
        document.title = parsedDoc.title || document.title;

        if (replaceState) {
            history.replaceState({ url }, '', url);
        } else {
            history.pushState({ url }, '', url);
        }

        executeScripts(document.body);

        if (typeof onPageChangeCallback === 'function') {
            onPageChangeCallback();
        }

        if (url.includes('#')) {
            const hash = url.substring(url.indexOf('#'));
            const targetEl = document.querySelector(hash);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth' });
            } else {
                window.scrollTo(0, 0);
            }
        } else {
            window.scrollTo(0, 0);
        }

        progressBar.style.width = '100%';
        setTimeout(() => {
            progressBar.style.opacity = '0';
            setTimeout(() => { progressBar.style.width = '0%'; }, 200);
        }, 150);

    } catch (error) {
        console.error('SPA navigation failed, reloading page natively:', error);
        window.location.href = url;
    } finally {
        isNavigating = false;
        requestAnimationFrame(() => {
            document.body.classList.remove('spa-hidden');
            setTimeout(() => {
                document.body.classList.remove('spa-fade');
            }, 150);
        });
    }
}
window.ajaxLoadPage = ajaxLoadPage;

export function initRouter(pageChangeHandler) {
    onPageChangeCallback = pageChangeHandler;

    // Global Click Interception
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;

        const href = link.getAttribute('href');
        if (!href) return;

        if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (href.startsWith('#')) return;
        if (link.getAttribute('target') === '_blank') return;
        if (link.hasAttribute('data-no-ajax')) return;

        const targetUrl = new URL(href, window.location.href);
        if (targetUrl.origin !== window.location.origin) return;

        e.preventDefault();
        ajaxLoadPage(targetUrl.href);
    });

    // History popstate
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.url) {
            ajaxLoadPage(e.state.url, true);
        } else {
            ajaxLoadPage(window.location.href, true);
        }
    });

    if (!history.state) {
        history.replaceState({ url: window.location.href }, '', window.location.href);
    }
}
