/**
 * Broker Listing Management Feature Module
 * Controls broker listings table, CRUD modal, form validation, and status change audit logging.
 */

import {
    getListings,
    getListingById,
    createListing,
    updateListing,
    deleteListing as removeListing,
    formatListingPrice,
    normalizeBrokerageType,
    calculateListingAge
} from '../../services/listing-service.js';
import { getListingMedia, saveListingMediaRows, MEDIA_PLACEHOLDER } from '../../services/media-service.js';
import { logListingStatusChange, sendBrokerNotification } from '../../services/notification-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { formatNominatimAddress } from '../../services/location-service.js';
import { hasProfanity } from '../../services/moderation-service.js';
import {
    uploadedMedia,
    setUploadedMedia,
    renderMediaGrid,
    handleMultipleUploads
} from './property-media.js';
import {
    wireNominatimCitySearch,
    wireUseCurrentLocationButton,
    wireLocationMapToggleButton,
    syncLocationMapView,
    updateLocationPickerFields
} from '../maps/location-search.js';
import { showToast } from '../../ui/toast.js';

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function syncListingPriceUnitForIntent(intent, priceUnitEl) {
    if (!priceUnitEl) return;
    priceUnitEl.value = intent === 'Rent' ? 'k' : 'cr';
}

export function populateListingPriceFields(listing, dispField, unitField, priceHidden) {
    if (!listing || listing.price === '' || listing.price == null) {
        if (dispField) dispField.value = '';
        if (priceHidden) priceHidden.value = '';
        return;
    }
    const p = parseFloat(listing.price);
    const intent = listing.intent || 'Buy';
    syncListingPriceUnitForIntent(intent, unitField);
    if (intent === 'Rent') {
        if (dispField) dispField.value = p;
    } else {
        const unit = unitField?.value || 'cr';
        if (unit === 'lac') {
            if (unitField) unitField.value = 'lac';
            if (dispField) dispField.value = (p * 100).toFixed(2);
        } else {
            if (unitField) unitField.value = 'cr';
            if (dispField) dispField.value = p;
        }
    }
    if (dispField) dispField.dispatchEvent(new Event('input'));
}

export function updateTrendBadge(items, elementId, dateField = 'created_at', valueField = null) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    let current = 0;
    let previous = 0;

    items.forEach(item => {
        const date = new Date(item[dateField]);
        const val = valueField ? (item[valueField] || 0) : 1;
        if (date >= startOfThisMonth) {
            current += val;
        } else if (date >= startOfLastMonth && date <= endOfLastMonth) {
            previous += val;
        }
    });

    let percentage = 0;
    if (previous === 0) {
        percentage = current > 0 ? 100 : 0;
    } else {
        percentage = ((current - previous) / previous) * 100;
    }

    const isPositive = percentage >= 0;
    const absVal = Math.abs(percentage).toFixed(1);
    
    if (isPositive) {
        el.className = 'flex items-center text-secondary font-body-sm text-body-sm bg-secondary-container px-2 py-0.5 rounded-full';
        el.innerHTML = `<span class="material-symbols-outlined text-[14px] mr-1">trending_up</span>${absVal}%`;
    } else {
        el.className = 'flex items-center text-error font-body-sm text-body-sm bg-error-container px-2 py-0.5 rounded-full';
        el.innerHTML = `<span class="material-symbols-outlined text-[14px] mr-1">trending_down</span>${absVal}%`;
    }
}

export async function renderListings() {
    const user = await getCurrentUser();
    let listings = await getListings();
    
    // Filter listings so the broker only sees and manages their own listings
    if (user) {
        listings = listings.filter(l => l.broker_id === user.id);
    }
    
    // Dynamically update listings overview stats
    const viewsEl = document.getElementById('stat-total-views');
    if (viewsEl) {
        const totalViews = listings.reduce((sum, l) => sum + (l.views || 0), 0);
        viewsEl.textContent = totalViews.toLocaleString();
    }
    
    const listingsCountEl = document.getElementById('stat-total-listings');
    if (listingsCountEl) {
        listingsCountEl.textContent = listings.length.toLocaleString();
    }
    
    // Update KPI trend badges
    updateTrendBadge(listings, 'stat-views-trend', 'created_at', 'views');
    updateTrendBadge(listings, 'stat-listings-trend', 'created_at');
    
    // Render widget (max 3)
    const tbodyWidget = document.getElementById('listings-tbody-widget');
    if (tbodyWidget) {
        tbodyWidget.innerHTML = generateListingsHTML(listings.slice(0, 3), false);
    }
    
    // Render full
    const tbodyFull = document.getElementById('listings-tbody-full');
    if (tbodyFull) {
        tbodyFull.innerHTML = generateListingsHTML(listings, true);
    }
}

export function generateListingsHTML(listings, showViews) {
    if (!listings.length) return '<tr><td colspan="6" class="p-8 text-center text-slate-400">No listings found. Click "Add Listing" to start.</td></tr>';
    
    return listings.map(l => {
        let badgeClass = 'bg-surface-container-high text-on-surface-variant';
        if (l.status === 'Active') badgeClass = 'bg-secondary-fixed text-on-secondary-fixed-variant';
        else if (l.status === 'Pending') badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
        else if (l.status === 'Flagged') badgeClass = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
        else if (l.status === 'Sold') badgeClass = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';

        const age = calculateListingAge(l.created_at);

        return `
        <tr class="border-b border-surface-variant hover:bg-surface-container transition-colors group" data-id="${l.id}">
          <td class="p-4">
            <div class="flex items-center gap-3">
              <img src="${l.img || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'}" alt="Property" class="w-12 h-12 rounded object-cover shadow-sm border border-outline-variant">
              <div>
                <p class="font-medium text-primary">${escHtml(l.title)}</p>
                <p class="text-on-surface-variant text-xs">${escHtml(l.location)}</p>
              </div>
            </div>
          </td>
          <td class="p-4">
            <span class="${badgeClass} px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">${l.status}</span>
          </td>
          <td class="p-4 font-medium">${formatListingPrice(l.price, l.intent)}</td>
          ${showViews ? `<td class="p-4">${(l.views || 0).toLocaleString()}</td>` : ''}
          <td class="p-4">
            <div class="text-sm font-medium text-slate-900">${age.date}</div>
            <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wide">${age.label}</div>
          </td>
          <td class="p-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="shareListing(${l.id})" class="p-1.5 text-on-surface-variant hover:text-primary rounded hover:bg-surface-container" title="Share">
                <span class="material-symbols-outlined text-[20px]">share</span>
              </button>
              <button onclick="openListingModal(${l.id})" class="p-1.5 text-on-surface-variant hover:text-primary rounded hover:bg-surface-container" title="Edit">
                <span class="material-symbols-outlined text-[20px]">edit</span>
              </button>
              <button onclick="deleteListing(${l.id})" class="p-1.5 text-on-surface-variant hover:text-error rounded hover:bg-error-container" title="Delete">
                <span class="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>
          </td>
        </tr>
        `;
    }).join('');
}

export async function deleteListing(id) {
    if (!confirm('Delete this listing?')) return;
    try {
        await removeListing(id);
        showToast('Listing deleted.');
        await renderListings();
    } catch (err) {
        showToast('Error deleting listing: ' + err.message);
    }
}
window.deleteListing = deleteListing;

export function shareListing(id) {
    const url = window.location.origin + '/property-details.html?id=' + id;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Listing link copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy link.');
    });
}
window.shareListing = shareListing;

export async function openListingModal(id) {
    const modal = document.getElementById('listing-modal');
    if (!modal) return;
    
    // Reset any validation warnings
    const errorBanner = document.getElementById('modal-validation-error');
    if (errorBanner) {
        errorBanner.classList.add('hidden');
        errorBanner.classList.remove('flex');
        const textSpan = errorBanner.querySelector('span:last-child');
        if (textSpan) textSpan.textContent = 'Please fill in all fields with valid information before saving.';
    }
    const inputsToReset = [
        'modal-prop-title', 'modal-location', 'modal-price', 
        'modal-intent', 'modal-type', 'modal-status', 
        'modal-beds', 'modal-baths', 'modal-sqft', 
        'modal-lat', 'modal-lng', 'modal-brokerage', 'modal-brokerage-type', 'modal-deposit'
    ];
    inputsToReset.forEach(inputId => {
        const el = document.getElementById(inputId);
        if (el) {
            el.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
            el.classList.add('border-outline-variant');
        }
    });
    const uploadZoneEl = document.getElementById('modal-upload-zone');
    if (uploadZoneEl) {
        uploadZoneEl.classList.remove('border-red-500', 'bg-red-50/20');
        uploadZoneEl.classList.add('border-slate-200');
    }

    let listing = null;
    if (id) {
        listing = await getListingById(id);
        if (!listing) {
            showToast('Error fetching listing');
            return;
        }
    }

    let mediaList = [];
    if (id) {
        const mediaRows = await getListingMedia(id);
        if (mediaRows && mediaRows.length > 0) {
            mediaList = mediaRows.map(row => ({
                url: row.url,
                media_type: row.media_type,
                is_cover: row.is_cover || false,
                alt_text: row.alt_text || null,
                thumbnail_url: row.thumbnail_url || null
            }));
        } else if (listing && listing.img) {
            mediaList = [{
                url: listing.img,
                media_type: 'image',
                is_cover: true,
                alt_text: null
            }];
        }
    }
    setUploadedMedia(mediaList);

    const userRole = localStorage.getItem('role');

    document.getElementById('modal-title').textContent   = listing ? 'Edit Listing' : 'Add New Listing';
    document.getElementById('modal-id').value            = listing ? listing.id : '';
    document.getElementById('modal-prop-title').value    = listing ? listing.title    : '';
    document.getElementById('modal-location').value      = listing ? listing.location  : '';
    
    const dispField = document.getElementById('modal-price-display');
    const unitField = document.getElementById('modal-price-unit');
    const priceHidden = document.getElementById('modal-price');
    if (listing) {
        populateListingPriceFields(listing, dispField, unitField, priceHidden);
    } else {
        if (dispField) dispField.value = '';
        if (priceHidden) priceHidden.value = '';
        syncListingPriceUnitForIntent('Buy', unitField);
    }
    document.getElementById('modal-intent').value        = listing ? listing.intent    : 'Buy';
    const brokerageEl = document.getElementById('modal-brokerage');
    const brokerageTypeEl = document.getElementById('modal-brokerage-type');
    const depositEl = document.getElementById('modal-deposit');
    if (brokerageEl) brokerageEl.value = listing ? (listing.brokerage ?? '') : '';
    if (brokerageTypeEl) brokerageTypeEl.value = listing ? normalizeBrokerageType(listing.brokerage_type) : 'one_time';
    if (depositEl) depositEl.value = listing ? (listing.deposit ?? '') : '';
    document.getElementById('modal-type').value          = listing ? listing.type      : 'Apartment';
    
    const statusSelect = document.getElementById('modal-status');
    if (statusSelect) {
        statusSelect.innerHTML = '';
        const allowedStatuses = userRole === 'Broker' 
            ? ['Draft', 'Pending', 'Sold']
            : ['Draft', 'Pending', 'Under Review', 'Active', 'Rejected', 'Suspended', 'Sold'];
        
        const currentStatus = listing ? listing.status : (userRole === 'Broker' ? 'Draft' : 'Active');
        const finalStatuses = [...allowedStatuses];
        if (!finalStatuses.includes(currentStatus)) {
            finalStatuses.push(currentStatus);
        }
        
        finalStatuses.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s === 'Active' ? 'Approved' : s;
            statusSelect.appendChild(opt);
        });
        statusSelect.value = currentStatus;
    }
    document.getElementById('modal-beds').value          = listing ? listing.beds      : '0';
    document.getElementById('modal-baths').value         = listing ? listing.baths     : '0';
    document.getElementById('modal-sqft').value          = listing ? listing.sqft      : '0';
    document.getElementById('modal-views').value         = listing ? listing.views     : '0';
    document.getElementById('modal-lat').value           = listing ? (listing.lat || '') : '';
    document.getElementById('modal-lng').value           = listing ? (listing.lng || '') : '';

    const listingMapDiv = document.getElementById('listing-modal-map');
    if (listingMapDiv) listingMapDiv.classList.add('hidden');
    const listingToggleMapBtn = document.getElementById('listing-toggle-map-btn');
    if (listingToggleMapBtn) {
        listingToggleMapBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">map</span> Choose on Map';
    }

    renderMediaGrid();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
window.openListingModal = openListingModal;

export function closeListingModal() {
    const modal = document.getElementById('listing-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}
window.closeListingModal = closeListingModal;

export async function saveListingForm() {
    const id       = document.getElementById('modal-id').value;
    const titleEl    = document.getElementById('modal-prop-title');
    const locationEl = document.getElementById('modal-location');
    const priceEl    = document.getElementById('modal-price');
    const intentEl   = document.getElementById('modal-intent');
    const typeEl     = document.getElementById('modal-type');
    const statusEl   = document.getElementById('modal-status');
    const bedsEl     = document.getElementById('modal-beds');
    const bathsEl    = document.getElementById('modal-baths');
    const sqftEl     = document.getElementById('modal-sqft');
    const latEl      = document.getElementById('modal-lat');
    const lngEl      = document.getElementById('modal-lng');
    const brokerageEl = document.getElementById('modal-brokerage');
    const brokerageTypeEl = document.getElementById('modal-brokerage-type');
    const depositEl  = document.getElementById('modal-deposit');

    const title    = titleEl.value.trim();
    const location = locationEl.value.trim();
    const price    = parseFloat(priceEl.value) || 0;
    const intent   = intentEl.value;
    const type     = typeEl.value;
    const status   = statusEl.value;
    const beds     = parseInt(bedsEl.value) || 0;
    const baths    = parseFloat(bathsEl.value) || 0;
    const sqft     = parseInt(sqftEl.value) || 0;
    const views    = parseInt(document.getElementById('modal-views').value) || 0;
    const lat      = parseFloat(latEl.value) || null;
    const lng      = parseFloat(lngEl.value) || null;
    const brokerage = parseFloat(brokerageEl?.value) || 0;
    const brokerage_type = brokerageTypeEl?.value || 'one_time';
    const deposit = parseFloat(depositEl?.value) || 0;
    
    const media = uploadedMedia;
    const coverItem = media.find(m => m.is_cover && m.media_type === 'image');
    const firstImage = media.find(m => m.media_type === 'image');
    const img = coverItem ? coverItem.url : (firstImage ? firstImage.url : MEDIA_PLACEHOLDER);

    // Reset styles
    [titleEl, locationEl, priceEl, intentEl, typeEl, statusEl, bedsEl, bathsEl, sqftEl, latEl, lngEl, brokerageEl, brokerageTypeEl, depositEl].forEach(el => {
        if (el) {
            el.classList.remove('border-red-500', 'ring-2', 'ring-red-100');
            el.classList.add('border-outline-variant');
        }
    });

    let hasErrors = false;
    function markInvalid(el) {
        if (el) {
            el.classList.remove('border-outline-variant');
            el.classList.add('border-red-500', 'ring-2', 'ring-red-100');
            hasErrors = true;
        }
    }

    if (title === '') markInvalid(titleEl);
    if (location === '') markInvalid(locationEl);
    if (priceEl.value.trim() === '' || price <= 0) markInvalid(priceEl);
    if (intent === '') markInvalid(intentEl);
    if (type === '') markInvalid(typeEl);
    if (status === '') markInvalid(statusEl);
    if (bedsEl.value.trim() === '' || beds < 0) markInvalid(bedsEl);
    if (bathsEl.value.trim() === '' || baths < 0) markInvalid(bathsEl);
    if (sqftEl.value.trim() === '' || sqft <= 0) markInvalid(sqftEl);
    if (brokerageEl && (brokerageEl.value.trim() === '' || brokerage < 0)) markInvalid(brokerageEl);
    if (depositEl && (depositEl.value.trim() === '' || deposit < 0)) markInvalid(depositEl);
    if (latEl.value.trim() === '' || isNaN(lat) || lat < -90 || lat > 90) markInvalid(latEl);
    if (lngEl.value.trim() === '' || isNaN(lng) || lng < -180 || lng > 180) markInvalid(lngEl);

    let profanityFound = false;
    if (hasProfanity(title) || hasProfanity(location)) {
        profanityFound = true;
        if (hasProfanity(title)) markInvalid(titleEl);
        if (hasProfanity(location)) markInvalid(locationEl);
    }

    const errorBanner = document.getElementById('modal-validation-error');
    if (profanityFound) {
        if (errorBanner) {
            const textSpan = errorBanner.querySelector('span:last-child');
            if (textSpan) textSpan.textContent = 'WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.';
            errorBanner.classList.remove('hidden');
            errorBanner.classList.add('flex');
            errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
        return;
    }

    if (hasErrors) {
        if (errorBanner) {
            const textSpan = errorBanner.querySelector('span:last-child');
            if (textSpan) textSpan.textContent = 'Please fill in all fields with valid information before saving.';
            errorBanner.classList.remove('hidden');
            errorBanner.classList.add('flex');
            errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast('Please correct the highlighted fields before saving.');
        return;
    } else {
        if (errorBanner) {
            errorBanner.classList.add('hidden');
            errorBanner.classList.remove('flex');
        }
    }

    const user = await getCurrentUser();
    
    let oldStatus = null;
    if (id) {
        const oldListing = await getListingById(id);
        if (oldListing) oldStatus = oldListing.status;
    }

    const listingData = { 
        title, location, price, intent, type, status, beds, baths, sqft, views, lat, lng, img,
        brokerage, brokerage_type, deposit,
        broker_id: user ? user.id : null
    };

    try {
        let resolvedId = id || null;
        if (id) {
            await updateListing(id, listingData);
        } else {
            const inserted = await createListing(listingData);
            if (inserted) resolvedId = inserted.id;
        }

        if (!id && resolvedId) {
            await logListingStatusChange(resolvedId, user ? user.id : null, null, status, 'Listing created.');
        } else if (id && oldStatus !== status) {
            await logListingStatusChange(id, user ? user.id : null, oldStatus, status, 'Status updated by owner.');
        }

        if (resolvedId) {
            await saveListingMediaRows(resolvedId, user ? user.id : null, uploadedMedia);
        }

        await renderListings();
        closeListingModal();

        // Show share popup for new listings
        if (!id) {
            const shareUrl = resolvedId
                ? `${window.location.origin}/property-details.html?id=${resolvedId}`
                : null;

            const overlay = document.createElement('div');
            overlay.id = 'listing-success-overlay';
            overlay.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm';
            overlay.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 space-y-6 text-center">
                    <div class="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                        <span class="material-symbols-outlined text-emerald-600 text-[28px]">check_circle</span>
                    </div>
                    <div>
                        <h3 class="text-xl font-black text-slate-900 tracking-tight">Listing Created!</h3>
                        <p class="text-sm text-slate-500 font-medium mt-1">Your listing <span class="font-black text-slate-900">#${resolvedId || '—'}</span> has been submitted for review.</p>
                    </div>
                    ${shareUrl ? `
                    <div class="space-y-2 text-left">
                        <label class="text-[10px] font-black uppercase tracking-widest text-slate-400">Shareable Link</label>
                        <div class="flex gap-2">
                            <input 
                                type="text" 
                                value="${shareUrl}" 
                                readonly 
                                id="listing-share-input"
                                class="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 outline-none truncate"
                            />
                            <button id="listing-copy-btn" class="px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-colors active:scale-95 flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-[16px]">content_copy</span>
                                Copy
                            </button>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-4">
                        <a href="https://api.whatsapp.com/send?text=${encodeURIComponent('Check out this property: ' + shareUrl)}" target="_blank" class="w-10 h-10 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center hover:bg-[#25D366]/20 transition-colors" title="Share on WhatsApp">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.555 4.195 1.613 6.015L.175 23.364l5.474-1.436c1.758.966 3.743 1.478 5.795 1.478 6.643 0 12.031-5.385 12.031-12.031S18.675 0 12.031 0zm3.844 17.202c-.174.492-.988.948-1.393 1.011-.34.053-.8.113-2.392-.511-1.926-.754-3.16-2.73-3.21-2.798-.052-.066-.766-1.02-.766-1.944 0-.923.483-1.378.653-1.564.168-.184.364-.23.485-.23.123 0 .245.006.353.012.115.005.27-.044.422.324.16.388.544 1.328.594 1.428.05.101.084.218.017.35-.067.133-.102.215-.203.334-.1.118-.21.258-.3.354-.102.108-.207.228-.09.431.115.203.513.85 1.101 1.377.758.681 1.402.893 1.603.993.203.102.321.084.441-.053.118-.135.513-.598.651-.803.138-.204.275-.17.46-.102.185.068 1.171.552 1.371.652.203.1.338.153.388.236.05.084.05.485-.124.977z"/></svg>
                        </a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" class="w-10 h-10 rounded-full bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center hover:bg-[#1877F2]/20 transition-colors" title="Share on Facebook">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                        <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Check out this amazing property listing!')}" target="_blank" class="w-10 h-10 rounded-full bg-[#1DA1F2]/10 text-[#1DA1F2] flex items-center justify-center hover:bg-[#1DA1F2]/20 transition-colors" title="Share on X (Twitter)">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z"/></svg>
                        </a>
                        <a href="mailto:?subject=Check out this property listing&body=${encodeURIComponent('Here is a great property listing I thought you might like: ' + shareUrl)}" class="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors" title="Share via Email">
                            <span class="material-symbols-outlined text-[20px]">mail</span>
                        </a>
                    </div>
                    ` : ''}
                    <button id="listing-success-close" class="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors active:scale-[0.98]">
                        Done
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);

            const copyBtn = overlay.querySelector('#listing-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        copyBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Copied!';
                        copyBtn.classList.replace('bg-slate-900', 'bg-emerald-600');
                        setTimeout(() => {
                            copyBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">content_copy</span> Copy';
                            copyBtn.classList.replace('bg-emerald-600', 'bg-slate-900');
                        }, 2000);
                    });
                });
            }

            const closePopup = () => overlay.remove();
            const closeBtn = overlay.querySelector('#listing-success-close');
            if (closeBtn) closeBtn.addEventListener('click', closePopup);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });
        } else {
            showToast('Listing updated successfully.');
        }
    } catch (err) {
        showToast('Error saving listing: ' + err.message);
    }
}
window.saveListingForm = saveListingForm;

export function injectListingModal() {
    if (document.getElementById('listing-modal')) return;

    const userRole = localStorage.getItem('role');

    const modal = document.createElement('div');
    modal.id = 'listing-modal';
    modal.className = 'hidden fixed inset-0 z-[100] items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-outline-variant">
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low">
          <h3 id="modal-title" class="font-h3 text-h3 text-primary">Add New Listing</h3>
          <button onclick="closeListingModal()" class="text-slate-400 hover:text-slate-700 transition-colors">
            <span class="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[70vh]">
          <div id="modal-validation-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">warning</span>
            <span>Please fill in all fields with valid information before saving.</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="hidden" id="modal-id"/>
            <input type="hidden" id="modal-views"/>
            <div class="md:col-span-2">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Property Title *</label>
              <input id="modal-prop-title" type="text" placeholder="e.g. 12 Marine Drive, Penthouse" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
            </div>
            <div class="md:col-span-2 relative">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Location *</label>
              <div class="relative">
                <input id="modal-location" type="text" autocomplete="off" placeholder="e.g. Bandra West, Mumbai" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
                <div id="modal-location-results" class="absolute left-0 right-0 mt-1 bg-surface-container-lowest rounded-lg shadow-xl border border-outline-variant hidden flex-col max-h-60 overflow-y-auto z-50"></div>
              </div>
              <div class="flex gap-3 mt-3">
                <button type="button" id="listing-use-location-btn" class="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px]">my_location</span>
                  Use Current Location
                </button>
                <button type="button" id="listing-toggle-map-btn" class="flex-1 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px]">map</span>
                  Choose on Map
                </button>
              </div>
              <div id="listing-modal-map" class="hidden"></div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Property Media <span class="text-slate-400 font-normal normal-case">(Images &amp; Videos — optional)</span></label>
              <div id="modal-media-grid" class="hidden grid grid-cols-3 gap-2 mb-2"></div>
              <div id="modal-upload-zone" class="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-primary hover:bg-slate-50/50 transition-all flex flex-col items-center justify-center gap-2 bg-surface-container-low">
                <span class="material-symbols-outlined text-[28px] text-slate-400">perm_media</span>
                <p class="text-sm font-medium text-slate-600">Drag &amp; drop images or videos, or <span class="text-primary font-bold">browse</span></p>
                <p class="text-xs text-slate-400">Supports PNG, JPG, JPEG, MP4, MOV, WEBM — multiple files allowed</p>
              </div>
              <input type="file" id="modal-file-input" class="hidden" accept="image/*,video/*" multiple />
              <div id="modal-upload-progress" class="hidden w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div class="bg-primary h-1.5 rounded-full animate-pulse" style="width: 100%"></div>
              </div>
              <input type="hidden" id="modal-img" />
            </div>
            <div class="min-w-0">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Price *</label>
              <div class="flex gap-2 min-w-0">
                <input id="modal-price-display" type="number" step="0.01" placeholder="e.g. 45" 
                  class="flex-1 min-w-0 bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed focus:border-transparent"/>
                <select id="modal-price-unit" 
                  class="shrink-0 min-w-[5.5rem] bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                  <option value="k">/mo (₹)</option>
                  <option value="lac">Lac (₹)</option>
                  <option value="cr">Cr (₹)</option>
                </select>
              </div>
              <input type="hidden" id="modal-price" />
              <p id="modal-price-preview" class="text-[10px] text-slate-400 font-medium mt-1"></p>
            </div>
            <div class="min-w-0">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Intent *</label>
              <select id="modal-intent" 
                class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="Rent">Rent</option>
                <option value="Buy">Sell</option>
              </select>
            </div>
            <div class="min-w-0">
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Brokerage *</label>
            <div class="flex gap-2 min-w-0">
                <input 
                class="flex-1 min-w-0 bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed"
                id="modal-brokerage"
                type="number"
                min="0"
                placeholder="0"/>
                <select id="modal-brokerage-type" 
                    class="shrink-0 min-w-[6.5rem] bg-surface-container-low border border-outline-variant rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                    <option value="one_time">One Time</option>
                    <option value="annually">Annually</option>
                </select>
            </div>
            </div>
            <div class="min-w-0">
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Deposit *</label>
            <input id="modal-deposit"
                type="number"
                min="0"
                placeholder="0"
                class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed"/>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Property Type *</label>
              <select id="modal-type" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Penthouse">Penthouse</option>
                <option value="Office">Office</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status *</label>
              <select id="modal-status" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed">
              </select>
              ${userRole === 'Broker' ? '<p class="text-[10px] text-amber-600 font-semibold mt-1">Note: All new/edited listings require employee approval before going Active.</p>' : ''}
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bedrooms *</label>
              <input id="modal-beds" type="number" placeholder="0" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bathrooms *</label>
              <input id="modal-baths" type="number" step="0.5" placeholder="0" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed"/>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Carpet Area in SqFt *</label>
              <input id="modal-sqft" type="number" placeholder="0" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed"/>
            </div>
            <input type="hidden" id="modal-lat" value="" />
            <input type="hidden" id="modal-lng" value="" />
          </div>
        </div>
        <div class="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
          <button onclick="closeListingModal()" class="px-5 py-2 rounded-lg border border-outline-variant text-on-surface-variant text-sm font-medium hover:bg-surface-container transition-colors">Cancel</button>
          <button onclick="saveListingForm()" class="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity">Save Listing</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeListingModal(); });

    // Price auto-converter
    const priceDisplay = document.getElementById('modal-price-display');
    const priceUnit = document.getElementById('modal-price-unit');
    const priceHidden = document.getElementById('modal-price');
    const pricePreview = document.getElementById('modal-price-preview');

    function convertPrice() {
      const val = parseFloat(priceDisplay.value);
      const intent = document.getElementById('modal-intent')?.value || 'Buy';
      if (isNaN(val)) {
        priceHidden.value = '';
        pricePreview.textContent = '';
        return;
      }
      const unit = priceUnit.value;
      if (intent === 'Rent' || unit === 'k') {
        priceHidden.value = val;
        pricePreview.textContent = `→ ₹${val.toLocaleString('en-IN')}/mo stored`;
        return;
      }
      if (unit === 'cr') {
        priceHidden.value = val;
        pricePreview.textContent = `→ ₹${val} Crore${val !== 1 ? 's' : ''}`;
      } else if (unit === 'lac') {
        const crores = val / 100;
        priceHidden.value = crores;
        pricePreview.textContent = `→ ₹${val} Lac = ₹${crores.toFixed(4)} Cr stored`;
      }
    }

    priceDisplay.addEventListener('input', convertPrice);
    priceUnit.addEventListener('change', convertPrice);

    const intentSelect = document.getElementById('modal-intent');
    if (intentSelect) {
      intentSelect.addEventListener('change', () => {
        syncListingPriceUnitForIntent(intentSelect.value, priceUnit);
        convertPrice();
      });
    }

    // Multi-media upload
    const uploadZone = document.getElementById('modal-upload-zone');
    const fileInput = document.getElementById('modal-file-input');

    if (uploadZone && fileInput) {
        uploadZone.onclick = () => fileInput.click();

        uploadZone.ondragover = (e) => {
            e.preventDefault();
            uploadZone.classList.add('border-primary', 'bg-slate-50');
        };

        uploadZone.ondragleave = () => {
            uploadZone.classList.remove('border-primary', 'bg-slate-50');
        };

        uploadZone.ondrop = (e) => {
            e.preventDefault();
            uploadZone.classList.remove('border-primary', 'bg-slate-50');
            const files = Array.from(e.dataTransfer.files);
            if (files.length) handleMultipleUploads(files, document.getElementById('modal-id')?.value || null);
        };

        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length) handleMultipleUploads(files, document.getElementById('modal-id')?.value || null);
            fileInput.value = '';
        };
    }

    // Location search inside listing modal
    wireNominatimCitySearch('modal-location', 'modal-location-results', {
        cityOnly: false,
        onSelect: (item) => {
            updateLocationPickerFields({
                lat: item.lat,
                lng: item.lon,
                latInputId: 'modal-lat',
                lngInputId: 'modal-lng',
                labelInputId: 'modal-location',
                doGeocode: false
            });
            syncLocationMapView('listing-modal-map', item.lat, item.lon);
        }
    });

    wireUseCurrentLocationButton('listing-use-location-btn', {
        latInputId: 'modal-lat',
        lngInputId: 'modal-lng',
        labelInputId: 'modal-location',
        mapContainerId: 'listing-modal-map'
    });

    wireLocationMapToggleButton('listing-toggle-map-btn', 'listing-modal-map', {
        latInputId: 'modal-lat',
        lngInputId: 'modal-lng',
        labelInputId: 'modal-location'
    });
}

export async function initListingsManager() {
    await renderListings();
    injectListingModal();
}
