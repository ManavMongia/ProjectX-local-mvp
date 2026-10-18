/**
 * Centralized Filters Module (Inspired by Myntra)
 * 
 * Features:
 * - Prominent [ Filters ] button integration
 * - Responsive slide-over drawer on desktop & mobile with backdrop blur
 * - Clear categorized filter sections (Intent, Type, Location, Price, Beds, Baths, Sqft,
 *   Recent Listings, Available From, Verification Status, Availability Status)
 * - Draft vs Applied state: Cancel discards uncommitted changes, Apply commits criteria
 * - Active filter count badge
 * - Active filter chips with individual dismiss (x) and Clear All
 * - Accessible keyboard navigation (Escape to close, accessible ARIA attributes)
 */

import { normalizeDateString } from '../../services/listing-service.js';

export const DEFAULT_FILTERS = {
    query: '',
    selectedTypes: [],
    intent: 'all',          // 'all' | 'buy' | 'rent'
    minPrice: 0,
    maxPrice: Infinity,
    activeBeds: 0,         // 0 = any
    activeBaths: 0,        // 0 = any
    minSqft: 0,
    maxSqft: Infinity,
    recent: null,          // null | 'all' | '24h' | '7d' | '30d'
    availableFrom: null,   // null | 'YYYY-MM-DD'
    verification: 'all',   // 'all' | 'verified' | 'non_verified'
    availabilityStatus: 'all', // 'all' | 'available' | 'sold_out'
    location: ''
};

let appliedFilters = { ...DEFAULT_FILTERS, selectedTypes: [] };
let draftFilters = { ...DEFAULT_FILTERS, selectedTypes: [] };
let applyCallback = null;

export function getAppliedFilters() {
    return { ...appliedFilters, selectedTypes: [...appliedFilters.selectedTypes] };
}

export function setAppliedFilters(newFilters) {
    appliedFilters = {
        ...DEFAULT_FILTERS,
        ...newFilters,
        selectedTypes: Array.isArray(newFilters?.selectedTypes) ? [...newFilters.selectedTypes] : []
    };
    if (typeof document !== 'undefined') {
        updateActiveFilterBadges();
        renderActiveFilterChips();
    }
}

/**
 * Counts the number of active non-default filters.
 *
 * @param {Object} f
 * @returns {number}
 */
export function countActiveFilters(f = appliedFilters) {
    let count = 0;
    if (f.intent && f.intent !== 'all') count++;
    if (f.selectedTypes && f.selectedTypes.length > 0) count += f.selectedTypes.length;
    if (f.location && f.location.trim() !== '') count++;
    if (f.minPrice > 0 || (f.maxPrice && f.maxPrice < Infinity)) count++;
    if (f.activeBeds > 0) count++;
    if (f.activeBaths > 0) count++;
    if (f.minSqft > 0 || (f.maxSqft && f.maxSqft < Infinity)) count++;
    if (f.recent && f.recent !== 'all') count++;
    if (f.availableFrom) count++;
    if (f.verification && f.verification !== 'all') count++;
    if (f.availabilityStatus && f.availabilityStatus !== 'all') count++;
    return count;
}

/**
 * Injects the centralized slide-over drawer and backdrop into the DOM.
 */
export function injectCentralizedFiltersDrawer() {
    if (document.getElementById('centralized-filters-drawer')) return;

    // 1. Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'centralized-filters-backdrop';
    backdrop.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] hidden opacity-0 transition-opacity duration-300';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    // 2. Drawer Panel
    const drawer = document.createElement('div');
    drawer.id = 'centralized-filters-drawer';
    drawer.className = 'fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-[101] flex flex-col transform translate-x-full transition-transform duration-300 ease-in-out border-l border-slate-200';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'drawer-heading');

    drawer.innerHTML = `
      <!-- Header -->
      <div class="h-16 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-[22px] text-slate-900">tune</span>
          <h2 id="drawer-heading" class="text-base font-black uppercase tracking-wider text-slate-900">Filters</h2>
          <span id="drawer-active-count-badge" class="ml-1 text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">0 Active</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="drawer-header-clear-btn" class="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-wider mr-2">Clear All</button>
          <button type="button" id="drawer-close-btn" class="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer" aria-label="Close filters">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      <!-- Scrollable Filter Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-7 divide-y divide-slate-100">

        <!-- 1. Property Intent -->
        <div class="space-y-3 pt-1 first:pt-0">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-slate-400">real_estate_agent</span>
              Property Intent
            </label>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button type="button" data-intent="all" class="drawer-intent-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900">All</button>
            <button type="button" data-intent="Buy" class="drawer-intent-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Buy</button>
            <button type="button" data-intent="Rent" class="drawer-intent-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Rent</button>
          </div>
        </div>

        <!-- 2. Property Type -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">apartment</span>
            Property Type
          </label>
          <div class="grid grid-cols-2 gap-2.5">
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition-colors group">
              <input type="checkbox" name="drawer-type" value="Apartment" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900">
              <span class="text-xs font-semibold text-slate-700 group-hover:text-slate-900">Apartment</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition-colors group">
              <input type="checkbox" name="drawer-type" value="Villa" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900">
              <span class="text-xs font-semibold text-slate-700 group-hover:text-slate-900">Villa</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition-colors group">
              <input type="checkbox" name="drawer-type" value="Penthouse" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900">
              <span class="text-xs font-semibold text-slate-700 group-hover:text-slate-900">Penthouse</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition-colors group">
              <input type="checkbox" name="drawer-type" value="Office" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900">
              <span class="text-xs font-semibold text-slate-700 group-hover:text-slate-900">Office</span>
            </label>
            <label class="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition-colors group col-span-2">
              <input type="checkbox" name="drawer-type" value="Bungalow/ Villa" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900">
              <span class="text-xs font-semibold text-slate-700 group-hover:text-slate-900">Bungalow / Villa</span>
            </label>
          </div>
        </div>

        <!-- 3. Recent Listings (NEW REQUIREMENT) -->
        <div class="space-y-3 pt-6">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-amber-500">schedule</span>
              Recent Listings
            </label>
            <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Fresh</span>
          </div>
          <p class="text-[11px] text-slate-400">Show properties based on verified listing creation time</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" data-recent="all" class="drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900">
              All Time
            </button>
            <button type="button" data-recent="24h" class="drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900 flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-amber-500">bolt</span>
              Last 24 Hours
            </button>
            <button type="button" data-recent="7d" class="drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900 flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-emerald-500">date_range</span>
              Last 7 Days
            </button>
            <button type="button" data-recent="30d" class="drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900 flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-blue-500">calendar_month</span>
              Last 30 Days
            </button>
          </div>
        </div>

        <!-- 4. Available From (NEW REQUIREMENT) -->
        <div class="space-y-3 pt-6">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-emerald-600">event_available</span>
              Available From
            </label>
            <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Move-In</span>
          </div>
          <p class="text-[11px] text-slate-400">Shows properties available on or before the selected date</p>
          <div class="space-y-2">
            <div class="relative">
              <input type="date" id="drawer-available-from" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-medium">
            </div>
            <div class="flex flex-wrap gap-2 pt-1">
              <button type="button" id="btn-avail-today" class="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                Available Immediately
              </button>
              <button type="button" id="btn-avail-month" class="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                Within 30 Days
              </button>
              <button type="button" id="btn-avail-clear" class="px-2.5 py-1 text-[11px] font-bold rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors">
                Clear Date
              </button>
            </div>
          </div>
        </div>

        <!-- 5. Price Range -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">payments</span>
            Price Range
          </label>
          <p class="text-[11px] text-slate-400">In Crores for Buy (or Lacs/month for Rent)</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Min Price</span>
              <input type="number" id="drawer-price-min" placeholder="e.g. 0.5" step="0.1" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900">
            </div>
            <div>
              <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Max Price</span>
              <input type="number" id="drawer-price-max" placeholder="e.g. 2.5" step="0.1" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900">
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 pt-1">
            <button type="button" data-min="0" data-max="0.5" class="drawer-price-bracket px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">&lt; ₹50L</button>
            <button type="button" data-min="0.5" data-max="1.0" class="drawer-price-bracket px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">₹50L - ₹1Cr</button>
            <button type="button" data-min="1.0" data-max="3.0" class="drawer-price-bracket px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">₹1Cr - ₹3Cr</button>
            <button type="button" data-min="3.0" data-max="" class="drawer-price-bracket px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">₹3Cr+</button>
          </div>
        </div>

        <!-- 6. Bedrooms / BHK -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">bed</span>
            Bedrooms (BHK)
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-bed="0" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-slate-900 text-white border-slate-900">Any</button>
            <button type="button" data-bed="1" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">1 BHK</button>
            <button type="button" data-bed="2" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">2 BHK</button>
            <button type="button" data-bed="3" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">3 BHK</button>
            <button type="button" data-bed="4" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">4 BHK</button>
            <button type="button" data-bed="5" class="drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">5+ BHK</button>
          </div>
        </div>

        <!-- 7. Bathrooms -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">bathtub</span>
            Bathrooms
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-bath="0" class="drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-slate-900 text-white border-slate-900">Any</button>
            <button type="button" data-bath="1" class="drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">1+</button>
            <button type="button" data-bath="2" class="drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">2+</button>
            <button type="button" data-bath="3" class="drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">3+</button>
          </div>
        </div>

        <!-- 8. Carpet Area / SqFt -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">square_foot</span>
            Carpet Area (Sq Ft)
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Min Sq Ft</span>
              <input type="number" id="drawer-sqft-min" placeholder="Min" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900">
            </div>
            <div>
              <span class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Max Sq Ft</span>
              <input type="number" id="drawer-sqft-max" placeholder="Max" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900">
            </div>
          </div>
        </div>

        <!-- 9. Verification Status -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
            Verification Status
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button type="button" data-verify="all" class="drawer-verify-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900">All</button>
            <button type="button" data-verify="verified" class="drawer-verify-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Verified</button>
            <button type="button" data-verify="non_verified" class="drawer-verify-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Non-Verified</button>
          </div>
        </div>

        <!-- 10. Availability Status -->
        <div class="space-y-3 pt-6">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px] text-slate-400">check_circle</span>
            Availability Status
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button type="button" data-status="all" class="drawer-status-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900">All</button>
            <button type="button" data-status="available" class="drawer-status-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Available</button>
            <button type="button" data-status="sold_out" class="drawer-status-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900">Sold Out</button>
          </div>
        </div>

      </div>

      <!-- Sticky Action Footer -->
      <div class="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
        <button type="button" id="drawer-cancel-btn" class="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <div class="flex items-center gap-2">
          <button type="button" id="drawer-footer-reset-btn" class="px-4 py-2.5 rounded-lg text-slate-600 font-bold text-xs uppercase tracking-wider hover:text-slate-900 hover:bg-slate-200/50 transition-colors">
            Clear All
          </button>
          <button type="button" id="drawer-apply-btn" class="px-6 py-2.5 rounded-lg bg-slate-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2">
            <span>Apply Filters</span>
            <span id="drawer-apply-count-pill" class="hidden bg-white/20 px-1.5 py-0.2 rounded text-[10px]">0</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(drawer);

    // Event wiring
    backdrop.addEventListener('click', cancelFiltersDrawer);
    document.getElementById('drawer-close-btn')?.addEventListener('click', cancelFiltersDrawer);
    document.getElementById('drawer-cancel-btn')?.addEventListener('click', cancelFiltersDrawer);
    document.getElementById('drawer-header-clear-btn')?.addEventListener('click', resetDraftFilters);
    document.getElementById('drawer-footer-reset-btn')?.addEventListener('click', resetDraftFilters);
    document.getElementById('drawer-apply-btn')?.addEventListener('click', commitFiltersDrawer);

    // Intent button listeners
    drawer.querySelectorAll('.drawer-intent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.intent = btn.dataset.intent || 'all';
            syncIntentUI();
            updateDrawerDraftCount();
        });
    });

    // Recent button listeners
    drawer.querySelectorAll('.drawer-recent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.recent = btn.dataset.recent || 'all';
            syncRecentUI();
            updateDrawerDraftCount();
        });
    });

    // Verification button listeners
    drawer.querySelectorAll('.drawer-verify-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.verification = btn.dataset.verify || 'all';
            syncVerifyUI();
            updateDrawerDraftCount();
        });
    });

    // Availability Status button listeners
    drawer.querySelectorAll('.drawer-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.availabilityStatus = btn.dataset.status || 'all';
            syncStatusUI();
            updateDrawerDraftCount();
        });
    });

    // Beds button listeners
    drawer.querySelectorAll('.drawer-bed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.activeBeds = parseFloat(btn.dataset.bed || 0);
            syncBedUI();
            updateDrawerDraftCount();
        });
    });

    // Baths button listeners
    drawer.querySelectorAll('.drawer-bath-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            draftFilters.activeBaths = parseFloat(btn.dataset.bath || 0);
            syncBathUI();
            updateDrawerDraftCount();
        });
    });

    // Price bracket quick chips
    drawer.querySelectorAll('.drawer-price-bracket').forEach(btn => {
        btn.addEventListener('click', () => {
            const min = parseFloat(btn.dataset.min) || 0;
            const max = btn.dataset.max ? parseFloat(btn.dataset.max) : Infinity;
            draftFilters.minPrice = min;
            draftFilters.maxPrice = max;
            const minInput = document.getElementById('drawer-price-min');
            const maxInput = document.getElementById('drawer-price-max');
            if (minInput) minInput.value = min > 0 ? min : '';
            if (maxInput) maxInput.value = max < Infinity ? max : '';
            updateDrawerDraftCount();
        });
    });

    // Price inputs
    const minPriceInput = document.getElementById('drawer-price-min');
    const maxPriceInput = document.getElementById('drawer-price-max');
    minPriceInput?.addEventListener('input', (e) => {
        draftFilters.minPrice = parseFloat(e.target.value) || 0;
        updateDrawerDraftCount();
    });
    maxPriceInput?.addEventListener('input', (e) => {
        draftFilters.maxPrice = e.target.value ? parseFloat(e.target.value) : Infinity;
        updateDrawerDraftCount();
    });

    // Sqft inputs
    const minSqftInput = document.getElementById('drawer-sqft-min');
    const maxSqftInput = document.getElementById('drawer-sqft-max');
    minSqftInput?.addEventListener('input', (e) => {
        draftFilters.minSqft = parseFloat(e.target.value) || 0;
        updateDrawerDraftCount();
    });
    maxSqftInput?.addEventListener('input', (e) => {
        draftFilters.maxSqft = e.target.value ? parseFloat(e.target.value) : Infinity;
        updateDrawerDraftCount();
    });

    // Type checkboxes
    drawer.querySelectorAll('input[name="drawer-type"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const checked = Array.from(drawer.querySelectorAll('input[name="drawer-type"]:checked')).map(i => i.value);
            draftFilters.selectedTypes = checked;
            updateDrawerDraftCount();
        });
    });

    // Available From date input & quick buttons
    const availDateInput = document.getElementById('drawer-available-from');
    availDateInput?.addEventListener('change', (e) => {
        draftFilters.availableFrom = e.target.value || null;
        updateDrawerDraftCount();
    });

    document.getElementById('btn-avail-today')?.addEventListener('click', () => {
        const todayStr = normalizeDateString(new Date());
        draftFilters.availableFrom = todayStr;
        if (availDateInput) availDateInput.value = todayStr;
        updateDrawerDraftCount();
    });

    document.getElementById('btn-avail-month')?.addEventListener('click', () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        const monthStr = normalizeDateString(d);
        draftFilters.availableFrom = monthStr;
        if (availDateInput) availDateInput.value = monthStr;
        updateDrawerDraftCount();
    });

    document.getElementById('btn-avail-clear')?.addEventListener('click', () => {
        draftFilters.availableFrom = null;
        if (availDateInput) availDateInput.value = '';
        updateDrawerDraftCount();
    });

    // Keyboard ESC to close drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawerOpen()) {
            cancelFiltersDrawer();
        }
    });
}

function isDrawerOpen() {
    const drawer = document.getElementById('centralized-filters-drawer');
    return drawer && !drawer.classList.contains('translate-x-full');
}

export function openFiltersDrawer() {
    injectCentralizedFiltersDrawer();
    const drawer = document.getElementById('centralized-filters-drawer');
    const backdrop = document.getElementById('centralized-filters-backdrop');
    if (!drawer || !backdrop) return;

    // Clone applied state into draft state
    draftFilters = {
        ...appliedFilters,
        selectedTypes: [...appliedFilters.selectedTypes]
    };

    // Populate all drawer inputs
    syncAllDrawerInputs();

    // Show backdrop and drawer
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        backdrop.classList.add('opacity-100');
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
    });

    // Focus close button or first interactive element
    document.getElementById('drawer-close-btn')?.focus();
}

export function closeFiltersDrawer() {
    const drawer = document.getElementById('centralized-filters-drawer');
    const backdrop = document.getElementById('centralized-filters-backdrop');
    if (!drawer || !backdrop) return;

    drawer.classList.remove('translate-x-0');
    drawer.classList.add('translate-x-full');
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');

    setTimeout(() => {
        backdrop.classList.add('hidden');
    }, 300);

    // Return focus to open button
    document.getElementById('open-filters-btn')?.focus();
}

export function cancelFiltersDrawer() {
    // Discard uncommitted draft changes
    draftFilters = {
        ...appliedFilters,
        selectedTypes: [...appliedFilters.selectedTypes]
    };
    closeFiltersDrawer();
}

export function commitFiltersDrawer() {
    // Commit draft state to applied state
    appliedFilters = {
        ...draftFilters,
        selectedTypes: [...draftFilters.selectedTypes]
    };

    closeFiltersDrawer();
    updateActiveFilterBadges();
    renderActiveFilterChips();

    if (typeof applyCallback === 'function') {
        applyCallback(appliedFilters);
    }
}

export function resetDraftFilters() {
    draftFilters = {
        ...DEFAULT_FILTERS,
        selectedTypes: []
    };
    syncAllDrawerInputs();
    updateDrawerDraftCount();
}

export function clearAllFilters() {
    appliedFilters = {
        ...DEFAULT_FILTERS,
        selectedTypes: []
    };
    draftFilters = {
        ...DEFAULT_FILTERS,
        selectedTypes: []
    };
    syncAllDrawerInputs();
    updateActiveFilterBadges();
    renderActiveFilterChips();

    if (typeof applyCallback === 'function') {
        applyCallback(appliedFilters);
    }
}

function syncAllDrawerInputs() {
    // Intent
    syncIntentUI();
    // Types
    document.querySelectorAll('input[name="drawer-type"]').forEach(cb => {
        cb.checked = draftFilters.selectedTypes.includes(cb.value);
    });
    // Recent
    syncRecentUI();
    // Available From
    const availInput = document.getElementById('drawer-available-from');
    if (availInput) availInput.value = draftFilters.availableFrom || '';
    // Price
    const minP = document.getElementById('drawer-price-min');
    if (minP) minP.value = draftFilters.minPrice > 0 ? draftFilters.minPrice : '';
    const maxP = document.getElementById('drawer-price-max');
    if (maxP) maxP.value = draftFilters.maxPrice < Infinity ? draftFilters.maxPrice : '';
    // Beds
    syncBedUI();
    // Baths
    syncBathUI();
    // Sqft
    const minS = document.getElementById('drawer-sqft-min');
    if (minS) minS.value = draftFilters.minSqft > 0 ? draftFilters.minSqft : '';
    const maxS = document.getElementById('drawer-sqft-max');
    if (maxS) maxS.value = draftFilters.maxSqft < Infinity ? draftFilters.maxSqft : '';
    // Verification
    syncVerifyUI();
    // Status
    syncStatusUI();

    updateDrawerDraftCount();
}

function syncIntentUI() {
    const val = draftFilters.intent || 'all';
    document.querySelectorAll('.drawer-intent-btn').forEach(btn => {
        const matches = btn.dataset.intent === val;
        btn.className = matches
            ? 'drawer-intent-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900'
            : 'drawer-intent-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function syncRecentUI() {
    const val = draftFilters.recent || 'all';
    document.querySelectorAll('.drawer-recent-btn').forEach(btn => {
        const matches = (btn.dataset.recent === val) || (!draftFilters.recent && btn.dataset.recent === 'all');
        btn.className = matches
            ? 'drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900 shadow-xs'
            : 'drawer-recent-btn py-2.5 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function syncVerifyUI() {
    const val = draftFilters.verification || 'all';
    document.querySelectorAll('.drawer-verify-btn').forEach(btn => {
        const matches = btn.dataset.verify === val;
        btn.className = matches
            ? 'drawer-verify-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900'
            : 'drawer-verify-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function syncStatusUI() {
    const val = draftFilters.availabilityStatus || 'all';
    document.querySelectorAll('.drawer-status-btn').forEach(btn => {
        const matches = btn.dataset.status === val;
        btn.className = matches
            ? 'drawer-status-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-slate-900 text-white border-slate-900'
            : 'drawer-status-btn py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function syncBedUI() {
    const val = draftFilters.activeBeds || 0;
    document.querySelectorAll('.drawer-bed-btn').forEach(btn => {
        const matches = parseFloat(btn.dataset.bed || 0) === val;
        btn.className = matches
            ? 'drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-slate-900 text-white border-slate-900'
            : 'drawer-bed-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function syncBathUI() {
    const val = draftFilters.activeBaths || 0;
    document.querySelectorAll('.drawer-bath-btn').forEach(btn => {
        const matches = parseFloat(btn.dataset.bath || 0) === val;
        btn.className = matches
            ? 'drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-slate-900 text-white border-slate-900'
            : 'drawer-bath-btn px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white text-slate-700 border-slate-200 hover:border-slate-900';
    });
}

function updateDrawerDraftCount() {
    const count = countActiveFilters(draftFilters);
    const badge = document.getElementById('drawer-active-count-badge');
    if (badge) {
        badge.textContent = `${count} Active`;
    }
    const applyPill = document.getElementById('drawer-apply-count-pill');
    if (applyPill) {
        if (count > 0) {
            applyPill.textContent = count;
            applyPill.classList.remove('hidden');
        } else {
            applyPill.classList.add('hidden');
        }
    }
}

export function updateActiveFilterBadges() {
    if (typeof document === 'undefined') return;
    const count = countActiveFilters(appliedFilters);
    ['active-filters-badge', 'active-filters-badge-secondary'].forEach(id => {
        const badge = document.getElementById(id);
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    });
}

export function renderActiveFilterChips() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('active-filter-chips-container');
    if (!container) return;

    const chips = [];

    if (appliedFilters.intent && appliedFilters.intent !== 'all') {
        chips.push({
            label: `Intent: ${appliedFilters.intent}`,
            remove: () => { appliedFilters.intent = 'all'; applyFilterChange(); }
        });
    }

    if (appliedFilters.selectedTypes && appliedFilters.selectedTypes.length > 0) {
        appliedFilters.selectedTypes.forEach(t => {
            chips.push({
                label: `Type: ${t}`,
                remove: () => {
                    appliedFilters.selectedTypes = appliedFilters.selectedTypes.filter(type => type !== t);
                    applyFilterChange();
                }
            });
        });
    }

    if (appliedFilters.minPrice > 0 || (appliedFilters.maxPrice && appliedFilters.maxPrice < Infinity)) {
        let priceLabel = 'Price: ';
        if (appliedFilters.minPrice > 0 && appliedFilters.maxPrice < Infinity) {
            priceLabel += `₹${appliedFilters.minPrice}Cr - ₹${appliedFilters.maxPrice}Cr`;
        } else if (appliedFilters.minPrice > 0) {
            priceLabel += `≥ ₹${appliedFilters.minPrice}Cr`;
        } else {
            priceLabel += `≤ ₹${appliedFilters.maxPrice}Cr`;
        }
        chips.push({
            label: priceLabel,
            remove: () => {
                appliedFilters.minPrice = 0;
                appliedFilters.maxPrice = Infinity;
                applyFilterChange();
            }
        });
    }

    if (appliedFilters.activeBeds > 0) {
        chips.push({
            label: `${appliedFilters.activeBeds}+ BHK`,
            remove: () => { appliedFilters.activeBeds = 0; applyFilterChange(); }
        });
    }

    if (appliedFilters.activeBaths > 0) {
        chips.push({
            label: `${appliedFilters.activeBaths}+ Baths`,
            remove: () => { appliedFilters.activeBaths = 0; applyFilterChange(); }
        });
    }

    if (appliedFilters.minSqft > 0 || (appliedFilters.maxSqft && appliedFilters.maxSqft < Infinity)) {
        let sqftLabel = 'Area: ';
        if (appliedFilters.minSqft > 0 && appliedFilters.maxSqft < Infinity) {
            sqftLabel += `${appliedFilters.minSqft} - ${appliedFilters.maxSqft} sqft`;
        } else if (appliedFilters.minSqft > 0) {
            sqftLabel += `≥ ${appliedFilters.minSqft} sqft`;
        } else {
            sqftLabel += `≤ ${appliedFilters.maxSqft} sqft`;
        }
        chips.push({
            label: sqftLabel,
            remove: () => {
                appliedFilters.minSqft = 0;
                appliedFilters.maxSqft = Infinity;
                applyFilterChange();
            }
        });
    }

    // Recent Listings Chip
    if (appliedFilters.recent && appliedFilters.recent !== 'all') {
        const recentLabels = {
            '24h': 'Last 24 Hours',
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days'
        };
        chips.push({
            label: `Recent: ${recentLabels[appliedFilters.recent] || appliedFilters.recent}`,
            remove: () => { appliedFilters.recent = null; applyFilterChange(); }
        });
    }

    // Available From Chip
    if (appliedFilters.availableFrom) {
        chips.push({
            label: `Available by: ${appliedFilters.availableFrom}`,
            remove: () => { appliedFilters.availableFrom = null; applyFilterChange(); }
        });
    }

    // Verification Status Chip
    if (appliedFilters.verification && appliedFilters.verification !== 'all') {
        chips.push({
            label: appliedFilters.verification === 'verified' ? '✓ Verified Only' : 'Non-Verified',
            remove: () => { appliedFilters.verification = 'all'; applyFilterChange(); }
        });
    }

    // Availability Status Chip
    if (appliedFilters.availabilityStatus && appliedFilters.availabilityStatus !== 'all') {
        chips.push({
            label: appliedFilters.availabilityStatus === 'sold_out' ? 'Sold Out' : 'Available',
            remove: () => { appliedFilters.availabilityStatus = 'all'; applyFilterChange(); }
        });
    }

    if (chips.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.innerHTML = `
      <div class="flex items-center gap-1.5 mr-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
        <span>Active Filters:</span>
      </div>
      <div class="flex flex-wrap items-center gap-2" id="filter-chips-list"></div>
      <button type="button" id="chips-clear-all-btn" class="ml-2 text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer underline">
        Clear All
      </button>
    `;
    container.classList.remove('hidden');

    const chipsList = document.getElementById('filter-chips-list');
    chips.forEach(chip => {
        const div = document.createElement('div');
        div.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white border border-slate-200 shadow-2xs text-slate-800';
        div.innerHTML = `
          <span>${chip.label}</span>
          <button type="button" class="w-4 h-4 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors" aria-label="Remove ${chip.label}">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        `;
        div.querySelector('button')?.addEventListener('click', chip.remove);
        chipsList.appendChild(div);
    });

    document.getElementById('chips-clear-all-btn')?.addEventListener('click', clearAllFilters);
}

function applyFilterChange() {
    updateActiveFilterBadges();
    renderActiveFilterChips();
    if (typeof applyCallback === 'function') {
        applyCallback(appliedFilters);
    }
}

/**
 * Initializes the Centralized Filters Feature.
 *
 * @param {Object} options
 * @param {Function} options.onApply Callback invoked whenever filters are applied
 */
export function initCentralizedFilters({ onApply } = {}) {
    applyCallback = onApply;
    injectCentralizedFiltersDrawer();

    const openBtn = document.getElementById('open-filters-btn');
    if (openBtn) {
        openBtn.addEventListener('click', openFiltersDrawer);
    }

    const openBtnSec = document.getElementById('open-filters-btn-secondary');
    if (openBtnSec) {
        openBtnSec.addEventListener('click', openFiltersDrawer);
    }

    updateActiveFilterBadges();
    renderActiveFilterChips();
}
