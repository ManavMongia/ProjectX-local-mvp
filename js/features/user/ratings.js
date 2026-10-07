/**
 * Rating & Review Feature Module
 * UI components, interactive star selection, review submission modal,
 * rating distribution rendering, and verified review cards.
 */

import {
    getUserRatingSummary,
    getRatingsForUser,
    getTransactionsForUser,
    checkRatingEligibility,
    submitRating,
    getEligibleTransactionsToRate,
    seedSampleDealsIfEmpty
} from '../../services/rating-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { showToast } from '../../ui/toast.js';

let activeTransactionId = null;
let activeTargetUserId = null;
let selectedStarRating = 0;

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STAR_LABELS = {
    1: 'Very Poor',
    2: 'Poor',
    3: 'Average',
    4: 'Good',
    5: 'Excellent'
};

/**
 * Injects the Reusable Rating Modal into the document body
 */
export function injectRatingModal() {
    if (document.getElementById('rating-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'rating-modal';
    modal.className = 'hidden fixed inset-0 z-[150] items-center justify-center bg-black/60 backdrop-blur-sm p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-[28px] shadow-2xl w-full max-w-lg mx-auto overflow-hidden border border-slate-100 font-['Outfit'] transition-all animate-fadeIn">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                <span class="material-symbols-outlined text-[12px]">verified</span>
                Verified Transaction
              </span>
              <span id="rating-modal-deal-id" class="text-xs font-mono text-slate-400 font-semibold"></span>
            </div>
            <h3 class="text-lg font-black text-slate-900 mt-1">Rate Your Experience</h3>
          </div>
          <button type="button" onclick="window.closeRatingModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 space-y-5">
          <!-- Target User & Property Header -->
          <div class="flex items-center gap-3.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <div class="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0" id="rating-modal-avatar">
              ?
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h4 id="rating-modal-target-name" class="font-bold text-sm text-slate-900 truncate">Participant</h4>
                <span id="rating-modal-target-role" class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">Broker</span>
              </div>
              <p id="rating-modal-property-title" class="text-xs text-slate-500 font-medium truncate mt-0.5">Property Deal</p>
            </div>
          </div>

          <!-- Alert banner inside modal -->
          <div id="rating-modal-alert" class="hidden flex items-start gap-2.5 p-3 rounded-xl text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-800">
            <span class="material-symbols-outlined text-[16px] text-rose-600 shrink-0 mt-0.5">error</span>
            <span id="rating-modal-alert-text" class="flex-1"></span>
          </div>

          <!-- Star Rating Input -->
          <div class="text-center py-2">
            <label class="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5">
              Select Your Rating (Required)
            </label>
            <div class="flex items-center justify-center gap-2" id="star-rating-buttons">
              ${[1, 2, 3, 4, 5].map(star => `
                <button type="button" data-star="${star}" class="star-btn p-1.5 text-slate-300 hover:scale-110 active:scale-95 transition-all outline-none" title="${STAR_LABELS[star]}">
                  <span class="material-symbols-outlined text-[36px] transition-colors pointer-events-none">star</span>
                </button>
              `).join('')}
            </div>
            <p id="star-rating-label" class="text-xs font-bold text-slate-500 mt-2 h-4">Tap a star to rate</p>
          </div>

          <!-- Written Review -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-[11px] font-black uppercase tracking-wider text-slate-500" for="rating-review-text">
                Written Review (Optional)
              </label>
              <span id="review-char-count" class="text-[11px] font-medium text-slate-400">0 / 500</span>
            </div>
            <textarea id="rating-review-text" rows="3" maxlength="500" placeholder="Share your experience working on this transaction (communication, punctuality, deal transparency)..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-slate-900 focus:bg-white transition-all resize-none"></textarea>
          </div>

          <!-- Anti-fraud disclosure notice -->
          <div class="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed bg-slate-50/50 p-3 rounded-xl">
            <span class="material-symbols-outlined text-[16px] text-slate-400 shrink-0 mt-0.5">shield</span>
            <span>Only verified counterparties of closed transactions can rate on ProjectX. Fake ratings and spam are strictly filtered.</span>
          </div>

          <!-- Submit Button -->
          <div class="flex gap-2.5 pt-1">
            <button type="button" onclick="window.closeRatingModal()" class="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="button" id="submit-rating-btn" class="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2">
              Submit Rating
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Modal background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeRatingModal();
    });

    // Wire star click listeners
    const starBtns = modal.querySelectorAll('.star-btn');
    starBtns.forEach(btn => {
        const star = parseInt(btn.getAttribute('data-star'), 10);

        btn.addEventListener('mouseenter', () => highlightStars(star));
        btn.addEventListener('mouseleave', () => highlightStars(selectedStarRating));
        btn.addEventListener('click', () => {
            selectedStarRating = star;
            highlightStars(selectedStarRating);
            const labelEl = document.getElementById('star-rating-label');
            if (labelEl) {
                labelEl.textContent = `${star} Star${star > 1 ? 's' : ''} — ${STAR_LABELS[star]}`;
                labelEl.className = 'text-xs font-bold text-slate-900 mt-2 h-4';
            }
        });
    });

    // Character counter
    const reviewTextarea = document.getElementById('rating-review-text');
    const charCounter = document.getElementById('review-char-count');
    if (reviewTextarea && charCounter) {
        reviewTextarea.addEventListener('input', () => {
            const len = reviewTextarea.value.length;
            charCounter.textContent = `${len} / 500`;
            if (len >= 490) {
                charCounter.classList.add('text-rose-500');
            } else {
                charCounter.classList.remove('text-rose-500');
            }
        });
    }

    // Submit handler
    const submitBtn = document.getElementById('submit-rating-btn');
    if (submitBtn) {
        submitBtn.onclick = handleModalRatingSubmit;
    }
}

function highlightStars(count) {
    const starBtns = document.querySelectorAll('#star-rating-buttons .star-btn');
    starBtns.forEach(btn => {
        const star = parseInt(btn.getAttribute('data-star'), 10);
        const icon = btn.querySelector('.material-symbols-outlined');
        if (!icon) return;

        if (star <= count) {
            btn.classList.add('text-amber-400');
            btn.classList.remove('text-slate-300');
            icon.style.fontVariationSettings = "'FILL' 1";
        } else {
            btn.classList.remove('text-amber-400');
            btn.classList.add('text-slate-300');
            icon.style.fontVariationSettings = "'FILL' 0";
        }
    });
}

function showModalAlert(message) {
    const alertBox = document.getElementById('rating-modal-alert');
    const alertText = document.getElementById('rating-modal-alert-text');
    if (alertBox && alertText) {
        alertText.textContent = message;
        alertBox.classList.remove('hidden');
    }
}

function clearModalAlert() {
    const alertBox = document.getElementById('rating-modal-alert');
    if (alertBox) alertBox.classList.add('hidden');
}

/**
 * Opens the rating modal for an eligible transaction
 */
export function openRatingModal({ transactionId, targetUserId, targetUserName, targetUserRole, propertyTitle }) {
    injectRatingModal();
    clearModalAlert();

    activeTransactionId = transactionId;
    activeTargetUserId = targetUserId;
    selectedStarRating = 0;
    highlightStars(0);

    const dealIdEl = document.getElementById('rating-modal-deal-id');
    const targetNameEl = document.getElementById('rating-modal-target-name');
    const targetRoleEl = document.getElementById('rating-modal-target-role');
    const propertyTitleEl = document.getElementById('rating-modal-property-title');
    const avatarEl = document.getElementById('rating-modal-avatar');
    const labelEl = document.getElementById('star-rating-label');
    const reviewTextarea = document.getElementById('rating-review-text');

    if (dealIdEl) dealIdEl.textContent = `#${String(transactionId).slice(-8)}`;
    if (targetNameEl) targetNameEl.textContent = targetUserName || 'Participant';
    if (targetRoleEl) targetRoleEl.textContent = targetUserRole || 'Broker';
    if (propertyTitleEl) propertyTitleEl.textContent = propertyTitle || 'Verified Property';
    if (avatarEl) avatarEl.textContent = (targetUserName || '?').charAt(0).toUpperCase();
    if (labelEl) {
        labelEl.textContent = 'Tap a star to rate';
        labelEl.className = 'text-xs font-bold text-slate-500 mt-2 h-4';
    }
    if (reviewTextarea) reviewTextarea.value = '';

    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}
window.openRatingModal = openRatingModal;

/**
 * Closes the rating modal
 */
export function closeRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearModalAlert();
}
window.closeRatingModal = closeRatingModal;

async function handleModalRatingSubmit() {
    clearModalAlert();
    const submitBtn = document.getElementById('submit-rating-btn');
    const reviewInput = document.getElementById('rating-review-text');

    if (!selectedStarRating || selectedStarRating < 1) {
        showModalAlert('Please select a star rating (1 to 5 stars) to proceed.');
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        showModalAlert('Your session has expired. Please sign in again.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    try {
        await submitRating({
            transactionId: activeTransactionId,
            raterId: user.id,
            ratedUserId: activeTargetUserId,
            rating: selectedStarRating,
            review: reviewInput?.value || '',
            raterName: localStorage.getItem('userName') || 'Verified User',
            raterRole: localStorage.getItem('role') || 'Buyer'
        });

        showToast('✓ Rating submitted successfully! Thank you for building platform trust.', 'success');
        closeRatingModal();

        // Refresh components on active page
        window.dispatchEvent(new CustomEvent('refreshRatingUI'));
    } catch (err) {
        console.error('Rating submission failed:', err);
        showModalAlert(err.message || 'Failed to submit rating.');
        showToast(err.message || 'Rating failed.', true);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Rating';
        }
    }
}

/**
 * Renders a full Rating Summary Card (Average, Stars, and Distribution)
 */
export async function renderUserRatingCard(containerId, userId) {
    const container = document.getElementById(containerId);
    if (!container || !userId) return;

    const summary = await getUserRatingSummary(userId);

    if (summary.count === 0) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                <div class="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 text-slate-300">
                    <span class="material-symbols-outlined text-[24px]">hotel_class</span>
                </div>
                <h4 class="font-bold text-sm text-slate-900">No ratings yet</h4>
                <p class="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Verified ratings appear here once deals are successfully completed through ProjectX.
                </p>
            </div>
        `;
        return;
    }

    const starsHtml = [1, 2, 3, 4, 5].map(s => {
        const isFilled = s <= Math.round(summary.average);
        return `<span class="material-symbols-outlined text-[20px] text-amber-400" style="font-variation-settings: 'FILL' ${isFilled ? 1 : 0};">star</span>`;
    }).join('');

    const distributionRows = [5, 4, 3, 2, 1].map(star => {
        const count = summary.distribution[star] || 0;
        const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
        return `
            <div class="flex items-center gap-2 text-xs">
                <span class="w-5 text-right font-bold text-slate-600">${star}★</span>
                <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-400 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <span class="w-8 text-right font-medium text-slate-400">${count}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div class="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
                <div class="text-center sm:text-left shrink-0">
                    <div class="flex items-baseline justify-center sm:justify-start gap-2">
                        <span class="text-4xl font-black text-slate-900 tracking-tight">${summary.average}</span>
                        <span class="text-sm font-semibold text-slate-400">/ 5.0</span>
                    </div>
                    <div class="flex items-center justify-center sm:justify-start gap-0.5 mt-1">
                        ${starsHtml}
                    </div>
                    <p class="text-xs font-semibold text-slate-500 mt-1.5 flex items-center gap-1 justify-center sm:justify-start">
                        <span class="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
                        ${summary.count} verified deal review${summary.count === 1 ? '' : 's'}
                    </p>
                </div>
                <div class="flex-1 w-full space-y-1.5">
                    ${distributionRows}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the list of verified reviews for a user
 */
export async function renderUserReviewsList(containerId, userId) {
    const container = document.getElementById(containerId);
    if (!container || !userId) return;

    const reviews = await getRatingsForUser(userId);

    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-slate-400 text-xs font-medium">
                No verified reviews yet. Ratings become available after a completed deal.
            </div>
        `;
        return;
    }

    container.innerHTML = reviews.map(r => {
        const starIcons = [1, 2, 3, 4, 5].map(s => {
            const isFilled = s <= r.rating;
            return `<span class="material-symbols-outlined text-[15px] text-amber-400" style="font-variation-settings: 'FILL' ${isFilled ? 1 : 0};">star</span>`;
        }).join('');

        const formattedDate = new Date(r.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        const raterName = r.rater_name || r.rater?.full_name || 'Verified User';
        const raterRole = r.rater_role || r.rater?.role || 'Buyer';
        const propTitle = r.property_title || r.transaction?.listing?.title || 'Closed Transaction';

        return `
            <div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3 transition-all hover:border-slate-300">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            ${raterName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h5 class="font-bold text-sm text-slate-900">${escHtml(raterName)}</h5>
                                <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${escHtml(raterRole)}</span>
                            </div>
                            <div class="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-medium">
                                <span class="flex items-center gap-0.5">${starIcons}</span>
                                <span>·</span>
                                <span>${formattedDate}</span>
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="window.openReportModal('review', '${r.id}', 'Review by ${escHtml(raterName)}')" class="text-slate-400 hover:text-red-500 p-1 rounded transition-colors" title="Report Review">
                        <span class="material-symbols-outlined text-[18px]">flag</span>
                    </button>
                </div>

                <!-- Verified Deal Badge -->
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-100">
                    <span class="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
                    <span>Closed Deal: ${escHtml(propTitle)}</span>
                </div>

                ${r.review ? `<p class="text-sm text-slate-700 leading-relaxed font-normal">${escHtml(r.review)}</p>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Renders an Action Banner if the current user has an unrated completed transaction with the profile target user
 */
export async function renderEligibleRateBanner(containerId, currentUserId, targetUserId, targetUserName) {
    const container = document.getElementById(containerId);
    if (!container || !currentUserId || !targetUserId || currentUserId === targetUserId) {
        if (container) container.innerHTML = '';
        return;
    }

    const eligible = await getEligibleTransactionsToRate(currentUserId, targetUserId);

    if (eligible.length === 0) {
        container.innerHTML = `
            <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-500 flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[18px] text-slate-400">info</span>
                <span>Verified ratings are unlocked after successfully completing a property transaction with this user.</span>
            </div>
        `;
        return;
    }

    const item = eligible[0]; // Most recent eligible transaction
    const tx = item.transaction;
    const propTitle = tx.property_title || tx.listing?.title || 'Property Deal';

    container.innerHTML = `
        <div class="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                        <span class="material-symbols-outlined text-[12px]">handshake</span>
                        Completed Transaction
                    </span>
                    <span class="text-xs text-slate-300 font-mono">#${String(tx.id).slice(-8)}</span>
                </div>
                <h4 class="font-extrabold text-base tracking-tight">How was your deal with ${escHtml(targetUserName)}?</h4>
                <p class="text-xs text-slate-300 font-normal">Closed for ${escHtml(propTitle)}. Share your feedback to build platform transparency.</p>
            </div>
            <button type="button" onclick="window.openRatingModal({ transactionId: '${tx.id}', targetUserId: '${targetUserId}', targetUserName: '${escHtml(targetUserName)}', targetUserRole: 'Participant', propertyTitle: '${escHtml(propTitle)}' })" class="bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">hotel_class</span>
                Rate Experience
            </button>
        </div>
    `;
}

/**
 * Renders the Deals & Transactions List with status and "Rate" CTA buttons
 */
export async function renderDealsList(containerId, currentUserId, userRole = 'Broker') {
    const container = document.getElementById(containerId);
    if (!container || !currentUserId) return;

    // Seed sample deals if empty so testing works immediately
    seedSampleDealsIfEmpty(currentUserId, userRole);

    const transactions = await getTransactionsForUser(currentUserId);

    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-sm">
                No transactions recorded yet. Deals initiated on ProjectX will appear here.
            </div>
        `;
        return;
    }

    const cardsHtml = await Promise.all(transactions.map(async tx => {
        const isBroker = tx.broker_id === currentUserId;
        const targetUserId = isBroker ? tx.buyer_id : tx.broker_id;
        const targetUserName = isBroker 
            ? (tx.buyer_name || tx.buyer?.full_name || 'Client') 
            : (tx.broker_name || tx.broker?.full_name || 'Broker');
        const targetUserRole = isBroker ? 'Buyer/Tenant' : 'Broker';
        const propTitle = tx.property_title || tx.listing?.title || 'Property Listing';
        const isCompleted = tx.status === 'completed';
        const isParticipant = (
            String(tx.broker_id) === String(currentUserId) ||
            String(tx.buyer_id)  === String(currentUserId) ||
            String(tx.seller_id) === String(currentUserId)
        );

        let actionHtml = '';
        if (isCompleted) {
            // Post-deal actions: Rental Agreement + Maintenance + Rating
            const existingRating = await checkRatingEligibility(tx.id, currentUserId, targetUserId);
            let ratingBtn = '';
            if (existingRating.existingRating) {
                const r = existingRating.existingRating;
                ratingBtn = `
                    <div class="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                        <span class="material-symbols-outlined text-[13px]" style="font-variation-settings: 'FILL' 1;">star</span>
                        <span>Rated ${r.rating}★</span>
                    </div>
                `;
            } else {
                ratingBtn = `
                    <button type="button" onclick="window.openRatingModal({ transactionId: '${tx.id}', targetUserId: '${targetUserId}', targetUserName: '${escHtml(targetUserName)}', targetUserRole: '${targetUserRole}', propertyTitle: '${escHtml(propTitle)}' })" class="bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1 transition-all active:scale-95 shadow-sm cursor-pointer" title="Rate your deal counterparty">
                        <span class="material-symbols-outlined text-[13px] text-amber-400" style="font-variation-settings: 'FILL' 1;">star</span>
                        Rate
                    </button>
                `;
            }

            actionHtml = `
                <div class="flex items-center justify-end gap-1.5 flex-wrap">
                    <a href="/rental-agreement.html?dealId=${tx.id}" class="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors" title="View official rental agreement">
                        <span class="material-symbols-outlined text-[14px]">description</span>
                        Agreement
                    </a>
                    <a href="/maintenance.html?dealId=${tx.id}" class="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors" title="Manage property maintenance requests">
                        <span class="material-symbols-outlined text-[14px]">build</span>
                        Maintenance
                    </a>
                    ${ratingBtn}
                </div>
            `;
        } else {
            // Deal is In Progress / Pending
            if (isParticipant) {
                actionHtml = `
                    <div class="flex items-center justify-end gap-2">
                        <button type="button" onclick="window.handleMarkDealDone('${tx.id}', '${currentUserId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 transition-all active:scale-95 shadow-sm cursor-pointer" title="Mark this transaction as completed">
                            <span class="material-symbols-outlined text-[15px]">check_circle</span>
                            Mark Deal Done
                        </button>
                    </div>
                `;
            } else {
                actionHtml = `
                    <span class="text-[11px] font-semibold text-slate-400 italic">
                        In Progress
                    </span>
                `;
            }
        }

        const formattedAmount = tx.amount ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : '—';
        const dateStr = tx.closed_at 
            ? new Date(tx.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/60 transition-colors font-medium">
                <td class="p-4">
                    <div class="font-bold text-slate-900 text-sm truncate max-w-xs">${escHtml(propTitle)}</div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5">Deal #${String(tx.id).slice(-8)}</div>
                </td>
                <td class="p-4">
                    <div class="text-sm font-bold text-slate-800">${escHtml(targetUserName)}</div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">${targetUserRole}</div>
                </td>
                <td class="p-4">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-md ${tx.transaction_type === 'Rental' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}">
                        ${tx.transaction_type || 'Sale'}
                    </span>
                </td>
                <td class="p-4 font-bold text-slate-900 text-sm">
                    ${formattedAmount}
                </td>
                <td class="p-4">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                        <span class="material-symbols-outlined text-[14px]">${isCompleted ? 'check_circle' : 'pending'}</span>
                        ${isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                    <div class="text-[10px] text-slate-400 mt-1">${dateStr}</div>
                </td>
                <td class="p-4 text-right">
                    ${actionHtml}
                </td>
            </tr>
        `;
    }));

    container.innerHTML = cardsHtml.join('');
}

/**
 * Initializes and coordinates ratings and reviews for profile.html
 */
export async function initProfileRatings({ targetUserId, isOwnProfile, currentUserId, profileName, profileRole }) {
    injectRatingModal();

    // 1. Render Eligible Rate Banner (if viewing another user you completed a deal with)
    if (!isOwnProfile && currentUserId && targetUserId) {
        await renderEligibleRateBanner('eligible-rate-banner-container', currentUserId, targetUserId, profileName);
    } else {
        const bannerContainer = document.getElementById('eligible-rate-banner-container');
        if (bannerContainer) bannerContainer.innerHTML = '';
    }

    // 2. Render Rating Summary Card (Average & Breakdown)
    await renderUserRatingCard('profile-rating-summary-card', targetUserId || currentUserId);

    // 3. Render Verified Reviews List
    await renderUserReviewsList('profile-reviews-list-container', targetUserId || currentUserId);

    // 4. Render Completed Deals Section
    const dealsContainer = document.getElementById('profile-deals-container');
    if (dealsContainer) {
        if (isOwnProfile && currentUserId) {
            dealsContainer.classList.remove('hidden');
            await renderDealsList('profile-deals-tbody', currentUserId, profileRole || 'Buyer');
        } else {
            dealsContainer.classList.add('hidden');
        }
    }
}
window.initProfileRatings = initProfileRatings;

/**
 * Global handler for "Mark Deal Done" button
 */
window.handleMarkDealDone = async function(transactionId, currentUserId) {
    if (!confirm('Are you sure you want to mark this transaction as completed?')) return;
    try {
        const { acknowledgeDealDone } = await import('../../services/deal-service.js');
        const role = localStorage.getItem('role') || 'Buyer';
        const result = await acknowledgeDealDone(transactionId, currentUserId, { role, forceComplete: true });
        showToast('Deal successfully completed! Rental agreement, maintenance, and reviews are now unlocked.', 'success');
        
        // Broadcast events
        window.dispatchEvent(new CustomEvent('refreshRatingUI'));
        window.dispatchEvent(new CustomEvent('dealCompleted', { detail: result.tx }));

        // Re-render deals list if present on page
        if (document.getElementById('profile-deals-tbody')) {
            await renderDealsList('profile-deals-tbody', currentUserId, role);
        }
        if (document.getElementById('broker-deals-tbody')) {
            await renderDealsList('broker-deals-tbody', currentUserId, 'Broker');
        }
    } catch (err) {
        showToast(err.message || 'Failed to complete deal', 'error');
    }
};

