/**
 * Property Search Feature Module
 * Coordinates home page hero search, properties directory, filters, sorting, and grid rendering.
 */

import { 
    getListings, 
    formatListingPrice, 
    formatIntentLabel, 
    calculateListingAge,
    isListingVerified,
    renderListingVerificationBadge
} from '../../services/listing-service.js';
import { searchLocation } from '../../services/location-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { syncSavedListings, getSavedListings } from '../../services/user-service.js';
import { navigateTo } from '../../core/router.js';
import { filterListingCard, resetFilterInputs } from './filters.js';
import { sortListingCards } from './sorting.js';
import { initPagination } from './pagination.js';
import { initGridListToggle } from '../../ui/grid-list-toggle.js';
import { showToast } from '../../ui/toast.js';

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function initBuyerHomePage() {
    // ── Search Bar Navigation ──
    const searchInput = document.getElementById('location-search');
    const searchBtn = document.getElementById('search-btn');
    const resultsContainer = document.getElementById('search-results');
    let debounceTimer;

    if (searchBtn && searchInput) {
        searchBtn.onclick = () => {
            const val = searchInput.value.trim();
            navigateTo(`map.html${val ? `?q=${encodeURIComponent(val)}` : ''}`);
        };
        searchInput.onkeypress = (e) => { if (e.key === 'Enter') searchBtn.click(); };

        if (resultsContainer) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const query = e.target.value.trim();
                if (query.length < 3) {
                    resultsContainer.classList.add('hidden');
                    return;
                }
                debounceTimer = setTimeout(async () => {
                    const data = await searchLocation(query, { countrycodes: 'IN', limit: 5 });
                    resultsContainer.innerHTML = '';
                    if (data.length === 0) {
                        resultsContainer.innerHTML = '<div class="p-4 text-sm text-slate-500 font-medium">No locations found.</div>';
                    } else {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'px-6 py-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 flex items-center gap-3';
                            div.innerHTML = `<span class="material-symbols-outlined text-slate-400 text-[20px]">location_on</span><span class="text-sm font-medium text-slate-700 truncate">${item.display_name}</span>`;
                            div.onclick = () => {
                                searchInput.value = item.display_name.split(',')[0];
                                resultsContainer.classList.add('hidden');
                                navigateTo(`map.html?lat=${item.lat}&lng=${item.lon}&q=${encodeURIComponent(item.display_name)}`);
                            };
                            resultsContainer.appendChild(div);
                        });
                    }
                    resultsContainer.classList.remove('hidden');
                    resultsContainer.classList.add('flex');
                }, 300);
            });
        }
    }

    // ── Featured Cards from Supabase ──
    const featuredGrid = document.querySelector('section.py-20 .grid');
    if (featuredGrid) {
        const listings = await getListings({ status: 'Active' });
        const top3 = listings.slice(0, 3);
        
        if (top3.length > 0) {
            const age0 = calculateListingAge(top3[0].created_at);
            featuredGrid.innerHTML = `
                <!-- Main Featured (2 cols) -->
                <div onclick="window.location.href='property-details.html?id=${top3[0].id}'"
                     class="md:col-span-2 bg-white border border-slate-200 flex flex-col md:flex-row shadow-sm cursor-pointer hover:shadow-lg transition-all">
                  <div class="w-full md:w-1/2 h-64 md:h-auto relative overflow-hidden">
                    <img src="${top3[0].img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" class="w-full h-full object-cover">
                    <div class="absolute top-4 left-4 flex items-center gap-1.5 z-10">
                      <span class="bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">Just Listed</span>
                      ${renderListingVerificationBadge(isListingVerified(top3[0]))}
                    </div>
                  </div>
                  <div class="w-full md:w-1/2 p-8 flex flex-col justify-center">
                    <div class="flex items-center justify-between gap-3 mb-2">
                      <h3 class="text-2xl font-black text-slate-900">${formatListingPrice(top3[0].price, top3[0].intent, { html: true })}</h3>
                      ${renderListingVerificationBadge(isListingVerified(top3[0]))}
                    </div>
                    <p class="text-sm font-bold text-slate-500 mb-6">${escHtml(top3[0].title)}, ${escHtml(top3[0].location)}</p>
                    <div class="flex items-center gap-6 pt-6 border-t border-slate-100">
                      <div class="flex items-center gap-2 text-slate-400"><span class="material-symbols-outlined text-[18px]">bed</span><span class="text-xs font-black text-slate-900">${top3[0].beds}</span></div>
                      <div class="flex items-center gap-2 text-slate-400"><span class="material-symbols-outlined text-[18px]">bathtub</span><span class="text-xs font-black text-slate-900">${top3[0].baths}</span></div>
                      <div class="flex items-center gap-2 text-slate-400"><span class="material-symbols-outlined text-[18px]">square_foot</span><span class="text-xs font-black text-slate-900">${(top3[0].sqft || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">schedule</span> Listed ${age0.date}
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                        age0.days <= 7 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : age0.days <= 30 
                            ? 'bg-amber-50 text-amber-700' 
                            : 'bg-slate-50 text-slate-600'
                      }">${age0.label}</span>
                    </div>
                  </div>
                </div>
                ${top3.slice(1).map(l => {
                    const age = calculateListingAge(l.created_at);
                    return `
                    <div onclick="window.location.href='property-details.html?id=${l.id}'"
                         class="bg-white border border-slate-200 flex flex-col shadow-sm cursor-pointer hover:shadow-lg transition-all">
                      <div class="h-48 relative overflow-hidden">
                        <img src="${l.img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" class="w-full h-full object-cover">
                        <div class="absolute top-4 left-4 flex items-center gap-1.5 z-10">
                          <span class="bg-white/90 backdrop-blur px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest text-slate-900">${l.type}</span>
                          ${renderListingVerificationBadge(isListingVerified(l))}
                        </div>
                      </div>
                      <div class="p-6 flex-1 flex flex-col">
                        <div class="flex items-center justify-between gap-2 mb-1">
                          <h3 class="text-lg font-black text-slate-900">${formatListingPrice(l.price, l.intent, { html: true })}</h3>
                          ${renderListingVerificationBadge(isListingVerified(l))}
                        </div>
                        <p class="text-xs font-bold text-slate-500 mb-4 truncate">${escHtml(l.title)}</p>
                        <div class="flex items-center gap-4 mt-auto pt-4 border-t border-slate-50">
                          <div class="flex items-center gap-1.5 text-slate-400"><span class="material-symbols-outlined text-[14px]">bed</span><span class="text-[10px] font-black text-slate-900">${l.beds}</span></div>
                          <div class="flex items-center gap-1.5 text-slate-400"><span class="material-symbols-outlined text-[14px]">square_foot</span><span class="text-[10px] font-black text-slate-900">${(l.sqft || 0).toLocaleString()}</span></div>
                        </div>
                        <div class="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between text-[10px]">
                          <span class="font-bold text-slate-400 uppercase tracking-widest">${age.date}</span>
                          <span class="font-extrabold uppercase tracking-wider ${
                            age.days <= 7 
                              ? 'text-emerald-600' 
                              : age.days <= 30 
                                ? 'text-amber-600' 
                                : 'text-slate-500'
                          }">${age.label}</span>
                        </div>
                      </div>
                    </div>
                    `;
                }).join('')}
                <div class="md:col-span-2 bg-slate-900 text-white p-10 relative overflow-hidden group min-h-[240px] flex items-center">
                  <div class="relative z-10">
                    <h3 class="text-3xl font-black mb-4">Data-Driven <span class="text-cyan-400">Insights.</span></h3>
                    <p class="text-sm text-slate-400 mb-8 max-w-md">Our proprietary engine analyzes market trends across Mumbai & Delhi to identify high-yield opportunities.</p>
                    <button onclick="window.location.href='map.html'" class="bg-cyan-500 text-slate-900 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-colors">Explore Heatmap</button>
                  </div>
                  <div class="absolute -right-20 -bottom-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-[80px]"></div>
                </div>
            `;
        }
    }
}

export async function initBuyerListingsPage() {
    const propertyGrid = document.getElementById('property-grid');
    if (!propertyGrid) return;

    const urlParams = new URLSearchParams(window.location.search);
    const brokerId = urlParams.get('brokerId');
    const intent = urlParams.get('intent');

    let listings = await getListings({ status: 'Active' });

    if (brokerId) {
        listings = listings.filter(l => l.broker_id === brokerId);
    }
    if (intent) {
        listings = listings.filter(l => l.intent.toLowerCase() === intent.toLowerCase());
    }
    
    propertyGrid.innerHTML = listings.map(l => {
        const age = calculateListingAge(l.created_at);
        return `
        <div class="group cursor-pointer property-card bg-white rounded-3xl border border-slate-200 hover:shadow-xl overflow-hidden transition-all duration-300" 
             data-id="${l.id}" data-title="${escHtml(l.title)}" data-location="${escHtml(l.location)}" 
             data-type="${l.type}" data-beds="${l.beds}" data-baths="${l.baths}" data-price="${l.price}" data-date="${l.created_at}">
          <div class="aspect-[16/9] overflow-hidden relative bg-slate-100">
            <img loading="lazy" src="${l.img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
            <div class="absolute top-4 left-4 flex items-center gap-1.5 z-10">
              <span class="bg-white/95 backdrop-blur px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">${formatIntentLabel(l.intent)}</span>
              ${renderListingVerificationBadge(isListingVerified(l))}
            </div>
            <button aria-label="Save Property" class="save-property-btn absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur rounded-full shadow text-slate-400 hover:text-error transition-colors">
              <span class="material-symbols-outlined text-[20px]">favorite</span>
            </button>
            <button aria-label="Share Property" class="share-property-btn absolute top-4 right-[52px] w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur rounded-full shadow text-slate-400 hover:text-blue-500 transition-colors z-10" onclick="event.stopPropagation();">
              <span class="material-symbols-outlined text-[20px]">share</span>
            </button>
            <button aria-label="Report Property" class="report-property-btn absolute top-4 right-[100px] w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur rounded-full shadow text-slate-400 hover:text-red-500 transition-colors z-10" onclick="event.stopPropagation(); window.openReportModal('listing', '${l.id}', '${escHtml(l.title)}');">
              <span class="material-symbols-outlined text-[20px]">flag</span>
            </button>
          </div>
          <div class="p-5">
            <div class="flex justify-between items-center mb-1">
              <h3 class="text-xl font-black text-slate-900">${formatListingPrice(l.price, l.intent, { html: true })}</h3>
              ${renderListingVerificationBadge(isListingVerified(l))}
            </div>
            <p class="text-slate-500 text-sm font-medium mb-4 truncate">${escHtml(l.title)}, ${escHtml(l.location)}</p>
            <div class="flex flex-wrap items-center gap-y-2 gap-x-4 text-slate-400">
              <div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">bed</span><span class="text-xs font-black text-slate-900">${l.beds}</span></div>
              <div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">bathtub</span><span class="text-xs font-black text-slate-900">${l.baths}</span></div>
              <div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">square_foot</span><span class="text-xs font-black text-slate-900">${(l.sqft || 0).toLocaleString()} <span class="font-normal text-slate-400">sqft</span></span></div>
            </div>
            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">schedule</span> Listed ${age.date}
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                age.days <= 7 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : age.days <= 30 
                    ? 'bg-amber-50 text-amber-700' 
                    : 'bg-slate-50 text-slate-600'
              }">${age.label}</span>
            </div>
          </div>
        </div>
        `;
    }).join('');

    const cards = Array.from(document.querySelectorAll('.property-card'));
    const countText = document.getElementById('listings-count-text');

    const updateCount = () => {
        const visibleCount = cards.filter(c => c.style.display !== 'none').length;
        if (countText) countText.textContent = `Showing ${visibleCount} exceptional listings in Mumbai & Delhi`;
    };

    let user = await getCurrentUser();
    let savedProperties = await getSavedListings(user ? user.id : null);

    const syncSavedHearts = () => {
        cards.forEach(card => {
            const id = card.dataset.id;
            const btn = card.querySelector('.save-property-btn');
            const icon = btn?.querySelector('.material-symbols-outlined');
            if (savedProperties.includes(id)) {
                if (icon) icon.style.fontVariationSettings = "'FILL' 1";
                btn?.classList.add('text-error');
            } else {
                if (icon) icon.style.fontVariationSettings = "'FILL' 0";
                btn?.classList.remove('text-error');
            }
        });
    };
    syncSavedHearts();

    const applyFilters = () => {
        const query = document.getElementById('listing-search-input')?.value.toLowerCase() || '';
        const selectedTypes = Array.from(document.querySelectorAll('input[name="type"]:checked')).map(i => i.value);
        const minPrice = parseFloat(document.getElementById('price-min')?.value) || 0;
        const maxPrice = parseFloat(document.getElementById('price-max')?.value) || Infinity;
        
        const activeBeds = document.querySelector('button[data-filter="beds"].bg-primary')?.dataset.value || 0;
        const activeBaths = document.querySelector('button[data-filter="baths"].bg-primary')?.dataset.value || 0;

        cards.forEach(card => {
            const isVisible = filterListingCard(card, {
                query,
                selectedTypes,
                minPrice,
                maxPrice,
                activeBeds,
                activeBaths
            });
            card.style.display = isVisible ? 'block' : 'none';
        });
        updateCount();
    };

    const sortCards = () => {
        const sortVal = document.getElementById('sort-dropdown')?.value;
        const sortedCards = sortListingCards(cards, sortVal);
        
        if (propertyGrid) {
            propertyGrid.innerHTML = '';
            sortedCards.forEach(c => propertyGrid.appendChild(c));
        }
    };

    document.getElementById('find-homes-btn')?.addEventListener('click', applyFilters);
    document.getElementById('listing-search-input')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });

    document.querySelectorAll('input[name="type"], #price-min, #price-max').forEach(el => {
        el.addEventListener('change', applyFilters);
    });

    ['price-min', 'price-max'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
    });

    document.querySelectorAll('button[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.filter;
            document.querySelectorAll(`button[data-filter="${filterType}"]`).forEach(b => {
                b.classList.remove('bg-primary', 'text-on-primary');
            });
            btn.classList.add('bg-primary', 'text-on-primary');
            applyFilters();
        });
    });

    document.getElementById('clear-all-filters')?.addEventListener('click', () => {
        resetFilterInputs();
        applyFilters();
        showToast('All filters cleared.');
    });

    document.getElementById('sort-dropdown')?.addEventListener('change', sortCards);

    // View Grid / List Toggle
    initGridListToggle({
        gridId: 'property-grid',
        gridBtnId: 'view-grid',
        listBtnId: 'view-list',
        cardSelector: '.property-card'
    });

    // Card interactions
    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.save-property-btn')) return;
            if (e.target.closest('.report-property-btn')) return;
            if (e.target.closest('.share-property-btn')) {
                const url = window.location.origin + '/property-details.html?id=' + (card.dataset.id || '');
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Link copied to clipboard!');
                }).catch(() => {
                    showToast('Failed to copy link.');
                });
                return;
            }
            navigateTo(`property-details.html?id=${card.dataset.id}`);
        });

        const saveBtn = card.querySelector('.save-property-btn');
        saveBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = card.dataset.id;
            const index = savedProperties.indexOf(id);
            if (index > -1) {
                savedProperties.splice(index, 1);
                showToast('Removed from saved properties.');
            } else {
                savedProperties.push(id);
                showToast('Property saved to your favorites.');
            }
            await syncSavedListings(user ? user.id : null, savedProperties);
            syncSavedHearts();
        });
    });

    initPagination('.pagination-btn');

    // Handle initial search & filters from URL
    const q = urlParams.get('q');
    const minPrice = urlParams.get('minPrice');
    const maxPrice = urlParams.get('maxPrice');
    const typeParam = urlParams.get('type');
    const beds = urlParams.get('beds');
    const baths = urlParams.get('baths');

    let shouldApply = false;

    if (q) {
        const input = document.getElementById('listing-search-input');
        if (input) {
            input.value = q;
            shouldApply = true;
        }
    }
    if (minPrice) {
        const input = document.getElementById('price-min');
        if (input) {
            input.value = minPrice;
            shouldApply = true;
        }
    }
    if (maxPrice) {
        const input = document.getElementById('price-max');
        if (input) {
            input.value = maxPrice;
            shouldApply = true;
        }
    }
    if (typeParam) {
        const types = typeParam.split(',');
        document.querySelectorAll('input[name="type"]').forEach(checkbox => {
            if (types.includes(checkbox.value)) {
                checkbox.checked = true;
                shouldApply = true;
            }
        });
    }
    if (beds) {
        const btn = document.querySelector(`button[data-filter="beds"][data-value="${beds}"]`);
        if (btn) {
            document.querySelectorAll('button[data-filter="beds"]').forEach(b => {
                b.classList.remove('bg-primary', 'text-on-primary');
            });
            btn.classList.add('bg-primary', 'text-on-primary');
            shouldApply = true;
        }
    }
    if (baths) {
        const btn = document.querySelector(`button[data-filter="baths"][data-value="${baths}"]`);
        if (btn) {
            document.querySelectorAll('button[data-filter="baths"]').forEach(b => {
                b.classList.remove('bg-primary', 'text-on-primary');
            });
            btn.classList.add('bg-primary', 'text-on-primary');
            shouldApply = true;
        }
    }

    if (shouldApply || brokerId || intent) {
        applyFilters();
    }
}
