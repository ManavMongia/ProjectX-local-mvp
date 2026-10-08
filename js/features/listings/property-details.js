/**
 * Property Details Feature Module
 * Controls the buyer-facing property details view, gallery, specs, moderation history,
 * broker card, and inquiry/chat initialization.
 */

import {
    getListingById,
    updateListing,
    deleteListing,
    incrementViewCount,
    formatListingPrice,
    calculateListingAge,
    isListingVerified,
    renderListingVerificationBadge,
    isListingSoldOut,
    markListingSoldOut,
    formatListingStatus
} from '../../services/listing-service.js';
import { getListingMedia, MEDIA_PLACEHOLDER } from '../../services/media-service.js';
import { getProfile } from '../../services/user-service.js';
import { getCurrentSession, getCurrentUser } from '../../services/auth-service.js';
import { getListingStatusHistory, hasProfanity } from '../../services/moderation-service.js';
import { createInquiry } from '../../services/inquiry-service.js';
import { renderInteractiveGallery } from './property-media.js';
import { initBuyerChat } from '../communication/chat.js';
import { getUserRatingSummary } from '../../services/rating-service.js';
import { showToast } from '../../ui/toast.js';

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function initBuyerDetailsPage() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;

    const l = await getListingById(id);
    if (!l) {
        showToast('Property not found.');
        return;
    }

    const session = await getCurrentSession();
    const userRole = localStorage.getItem('role');
    const isOwner = session && session.user && session.user.id === l.broker_id;
    const isStaff = userRole === 'Admin' || userRole === 'Employee';
    const isAdminPreview = new URLSearchParams(window.location.search).get('adminPreview') === '1';

    const isSoldOut = isListingSoldOut(l);

    if (l.status !== 'Active' && !isSoldOut && !isOwner && !isStaff && !isAdminPreview) {
        showToast('Property details are pending review or unavailable.', true);
        setTimeout(() => { window.location.href = 'properties.html'; }, 2000);
        return;
    }

    // Render Moderation History timeline for owner or staff
    if (isOwner || isStaff) {
        const modHistorySec = document.getElementById('moderation-history-section');
        const modHistoryTimeline = document.getElementById('moderation-history-timeline');
        if (modHistorySec && modHistoryTimeline) {
            try {
                const logs = await getListingStatusHistory(id);
                modHistorySec.classList.remove('hidden');

                if (!logs || logs.length === 0) {
                    modHistoryTimeline.innerHTML = `<div class="text-xs text-slate-400 italic">No moderation history logged yet.</div>`;
                } else {
                    modHistoryTimeline.innerHTML = logs.map(log => {
                        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : '—';
                        const newStatusVal = log.new_status === 'Active' ? 'Approved' : log.new_status;
                        const oldStatusVal = log.old_status ? (log.old_status === 'Active' ? 'Approved' : log.old_status) : 'None';
                        
                        let dotColor = 'bg-slate-400';
                        if (log.new_status === 'Active') dotColor = 'bg-emerald-500 ring-4 ring-emerald-100';
                        else if (log.new_status === 'Rejected') dotColor = 'bg-rose-500 ring-4 ring-rose-100';
                        else if (log.new_status === 'Suspended') dotColor = 'bg-slate-700 ring-4 ring-slate-200';
                        else if (log.new_status === 'Under Review') dotColor = 'bg-blue-500 ring-4 ring-blue-100';
                        else if (log.new_status === 'Pending') dotColor = 'bg-amber-500 ring-4 ring-amber-100';

                        return `
                            <div class="relative">
                                <div class="absolute left-0 top-1.5 w-3 h-3 rounded-full -translate-x-[30.5px] ${dotColor}"></div>
                                <div class="flex flex-col gap-1 font-sans">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold text-slate-800">
                                            ${oldStatusVal} ➔ ${newStatusVal}
                                        </span>
                                        <span class="text-[10px] text-slate-400 font-semibold">• ${dateStr}</span>
                                    </div>
                                    <p class="text-xs text-slate-600 font-medium">
                                        Changed by: <span class="font-bold text-slate-700">${log.profiles?.full_name || 'System'}</span> 
                                        (${log.profiles?.role || 'System'})
                                    </p>
                                    <div class="text-xs bg-slate-50 border border-slate-100 rounded-lg p-2.5 mt-1 text-slate-500 italic font-medium">
                                        "${log.reason}"
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            } catch (err) {
                console.error("Failed to load moderation history:", err);
            }
        }
    }

    // Top status badge
    const statusBadge = document.getElementById('detail-status-badge');
    if (statusBadge) {
        if (isSoldOut) {
            statusBadge.textContent = 'SOLD OUT';
            statusBadge.className = 'bg-rose-100 text-rose-800 border border-rose-200 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-xs';
        } else {
            statusBadge.textContent = l.status;
            if (l.status === 'Active') {
                statusBadge.className = 'bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
            } else if (l.status === 'Pending') {
                statusBadge.className = 'bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
            } else if (l.status === 'Flagged') {
                statusBadge.className = 'bg-rose-100 text-rose-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
            } else if (l.status === 'Sold') {
                statusBadge.className = 'bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
            }
        }
    }

    // Listing verification badge
    const vBadge = document.getElementById('detail-verification-badge');
    if (vBadge) {
        vBadge.innerHTML = renderListingVerificationBadge(isListingVerified(l));
    }

    // Sold Out Buyer Notice & Action Disabling
    if (isSoldOut) {
        const descSection = document.getElementById('detail-desc');
        if (descSection && !document.getElementById('detail-sold-out-banner')) {
            const soldOutBanner = document.createElement('div');
            soldOutBanner.id = 'detail-sold-out-banner';
            soldOutBanner.className = 'p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl mb-6 flex items-start gap-3 shadow-xs';
            soldOutBanner.innerHTML = `
                <span class="material-symbols-outlined text-rose-600 text-[24px] shrink-0 mt-0.5">do_not_disturb_on</span>
                <div>
                    <h4 class="font-black text-sm uppercase tracking-wider text-rose-900">Property Sold Out</h4>
                    <p class="text-xs text-rose-700 font-medium mt-0.5 leading-relaxed">
                        This property has been marked as Sold Out and is no longer available. Inquiries and offers for this listing are currently closed.
                    </p>
                </div>
            `;
            descSection.parentElement?.insertBefore(soldOutBanner, descSection);
        }

        const inquiryForm = document.getElementById('buyer-inquiry-form');
        if (inquiryForm) {
            inquiryForm.innerHTML = `
                <div class="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2.5">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black uppercase tracking-wider">
                        <span class="material-symbols-outlined text-[15px]">do_not_disturb_on</span>
                        Inquiries Closed
                    </span>
                    <p class="text-xs text-slate-500 font-medium leading-relaxed">
                        This listing is sold out. Tour schedules, offers, and direct inquiries for this property have concluded.
                    </p>
                </div>
            `;
        }

        const chatSec = document.getElementById('buyer-chat-section');
        if (chatSec) chatSec.classList.add('hidden');
    }

    if (isAdminPreview) {
        const banner = document.createElement('div');
        banner.id = 'admin-preview-banner';
        banner.className = 'fixed top-0 left-0 right-0 z-[999] bg-amber-500 text-amber-950 text-center text-xs font-black uppercase tracking-widest py-2 flex items-center justify-center gap-2';
        banner.innerHTML = `<span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Admin Preview Mode — Status: ${l.status} — Changes made here are live`;
        document.body.prepend(banner);
        document.body.style.paddingTop = '96px';

        const navBar = document.querySelector('nav');
        if (navBar) {
            navBar.style.top = '32px';
        }

        const navContainer = document.querySelector('nav .hidden.md\\:flex');
        if (navContainer) {
            navContainer.style.setProperty('display', 'none', 'important');
        }

        const logoContainer = Array.from(document.querySelectorAll('a')).find(a => a.textContent === 'ProjectX')?.parentElement;
        if (logoContainer && !document.getElementById('admin-preview-tag')) {
            const adminTag = document.createElement('span');
            adminTag.id = 'admin-preview-tag';
            adminTag.className = 'bg-slate-900 text-white px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase ml-2';
            adminTag.textContent = 'Admin Preview';
            logoContainer.appendChild(adminTag);
        }

        const rightContainer = document.querySelector('nav .flex.items-center.gap-4');
        if (rightContainer) {
            const profileBtn = Array.from(rightContainer.querySelectorAll('button')).find(btn => btn.querySelector('span')?.textContent === 'account_circle');
            if (profileBtn) {
                profileBtn.style.setProperty('display', 'none', 'important');
            }
        }

        const inquiryForm = document.getElementById('buyer-inquiry-form');
        const chatSection = document.getElementById('buyer-chat-section');
        const reportBtn = document.getElementById('report-listing-btn');
        if (inquiryForm) inquiryForm.classList.add('hidden');
        if (chatSection) chatSection.classList.add('hidden');
        if (reportBtn) reportBtn.classList.add('hidden');

        // Moderation Console Panel
        const modPanel = document.createElement('div');
        modPanel.id = 'admin-moderation-panel';
        modPanel.className = 'space-y-6 mt-6 pt-6 border-t border-slate-100';
        
        let statusBadgeClass = 'bg-slate-100 text-slate-800';
        if (l.status === 'Active') statusBadgeClass = 'bg-emerald-100 text-emerald-800';
        else if (l.status === 'Pending') statusBadgeClass = 'bg-amber-100 text-amber-800';
        else if (l.status === 'Flagged') statusBadgeClass = 'bg-rose-100 text-rose-800';
        else if (l.status === 'Sold') statusBadgeClass = 'bg-slate-100 text-slate-800';

        const updateButtonsVisibility = (status) => {
            const showApprove = status !== 'Active';
            const showFlag = status !== 'Flagged' && status !== 'Sold';
            
            const approveBtn = modPanel.querySelector('#mod-approve-btn');
            const flagBtn = modPanel.querySelector('#mod-flag-btn');
            
            if (approveBtn) {
                if (showApprove) approveBtn.classList.remove('hidden');
                else approveBtn.classList.add('hidden');
            }
            if (flagBtn) {
                if (showFlag) flagBtn.classList.remove('hidden');
                else flagBtn.classList.add('hidden');
            }
        };

        modPanel.innerHTML = `
            <div>
                <h4 class="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">Moderation Console</h4>
                <div class="flex items-center justify-between gap-2 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-500">Status:</span>
                        <span class="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${statusBadgeClass}" id="mod-status-badge">
                            ${l.status}
                        </span>
                    </div>
                    <div id="mod-verification-status-wrap">
                        ${renderListingVerificationBadge(isListingVerified(l))}
                    </div>
                </div>
            </div>
            <div class="flex flex-col gap-3">
                <button id="mod-toggle-verify-btn" class="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl font-bold text-sm transition-colors shadow-sm">
                    <span class="material-symbols-outlined text-[20px]">${isListingVerified(l) ? 'verified' : 'new_releases'}</span>
                    <span>${isListingVerified(l) ? 'Mark as Non-Verified' : 'Verify Listing'}</span>
                </button>
                <button id="mod-approve-btn" class="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-colors shadow-sm ${l.status === 'Active' ? 'hidden' : ''}">
                    <span class="material-symbols-outlined text-[20px]">check_circle</span>
                    Approve Listing
                </button>
                <button id="mod-flag-btn" class="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm transition-colors shadow-sm ${(l.status === 'Flagged' || l.status === 'Sold') ? 'hidden' : ''}">
                    <span class="material-symbols-outlined text-[20px]">flag</span>
                    Flag Listing
                </button>
                <button id="mod-delete-btn" class="w-full flex items-center justify-center gap-2 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-2xl font-bold text-sm transition-colors">
                    <span class="material-symbols-outlined text-[20px]">delete</span>
                    Delete Listing
                </button>
            </div>
        `;

        if (inquiryForm && inquiryForm.parentElement) {
            inquiryForm.parentElement.appendChild(modPanel);
        }

        const toggleVerifyBtn = modPanel.querySelector('#mod-toggle-verify-btn');
        if (toggleVerifyBtn) {
            toggleVerifyBtn.onclick = async () => {
                const currentV = isListingVerified(l);
                const nextV = !currentV;
                const actionLabel = nextV ? 'verify' : 'un-verify (mark as Non-Verified)';
                if (confirm(`Are you sure you want to ${actionLabel} "${l.title}"?`)) {
                    try {
                        await updateListing(l.id, { is_verified: nextV });
                        l.is_verified = nextV;
                        showToast(`✓ Listing marked as ${nextV ? 'Verified' : 'Non-Verified'}`);
                        const vWrap = document.getElementById('mod-verification-status-wrap');
                        if (vWrap) vWrap.innerHTML = renderListingVerificationBadge(nextV);
                        const vBadgeEl = document.getElementById('detail-verification-badge');
                        if (vBadgeEl) vBadgeEl.innerHTML = renderListingVerificationBadge(nextV);
                        toggleVerifyBtn.querySelector('span:last-child').textContent = nextV ? 'Mark as Non-Verified' : 'Verify Listing';
                        toggleVerifyBtn.querySelector('.material-symbols-outlined').textContent = nextV ? 'verified' : 'new_releases';
                    } catch (err) {
                        showToast(err.message, true);
                    }
                }
            };
        }

        const approveBtn = modPanel.querySelector('#mod-approve-btn');
        if (approveBtn) {
            approveBtn.onclick = async () => {
                if (confirm(`Are you sure you want to approve "${l.title}"?`)) {
                    try {
                        await updateListing(l.id, { status: 'Active' });
                        showToast('✓ Listing approved successfully');
                        l.status = 'Active';
                        const badge = document.getElementById('mod-status-badge');
                        if (badge) {
                            badge.textContent = 'Active';
                            badge.className = 'px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800';
                        }
                        if (statusBadge) {
                            statusBadge.textContent = 'Active';
                            statusBadge.className = 'bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
                        }
                        const topBanner = document.getElementById('admin-preview-banner');
                        if (topBanner) {
                            topBanner.innerHTML = `<span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Admin Preview Mode — Status: Active — Changes made here are live`;
                        }
                        updateButtonsVisibility('Active');
                    } catch (err) {
                        showToast(err.message, true);
                    }
                }
            };
        }

        const flagBtn = modPanel.querySelector('#mod-flag-btn');
        if (flagBtn) {
            flagBtn.onclick = async () => {
                if (confirm(`Are you sure you want to flag "${l.title}"?`)) {
                    try {
                        await updateListing(l.id, { status: 'Flagged' });
                        showToast('✓ Listing flagged successfully');
                        l.status = 'Flagged';
                        const badge = document.getElementById('mod-status-badge');
                        if (badge) {
                            badge.textContent = 'Flagged';
                            badge.className = 'px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800';
                        }
                        if (statusBadge) {
                            statusBadge.textContent = 'Flagged';
                            statusBadge.className = 'bg-rose-100 text-rose-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest';
                        }
                        const topBanner = document.getElementById('admin-preview-banner');
                        if (topBanner) {
                            topBanner.innerHTML = `<span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Admin Preview Mode — Status: Flagged — Changes made here are live`;
                        }
                        updateButtonsVisibility('Flagged');
                    } catch (err) {
                        showToast(err.message, true);
                    }
                }
            };
        }

        const deleteBtn = modPanel.querySelector('#mod-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm(`Are you sure you want to permanently delete "${l.title}"? This cannot be undone.`)) {
                    try {
                        await deleteListing(l.id);
                        showToast('✓ Listing deleted successfully');
                        setTimeout(() => { window.close(); }, 1000);
                    } catch (err) {
                        showToast(err.message, true);
                    }
                }
            };
        }
    }

    // Increment view count if viewer is not the listing owner
    if (!isOwner) {
        await incrementViewCount(id);
        l.views = (l.views || 0) + 1;
    }

    // Broker Profile display
    let brokerName = 'Mehdi Ali';
    let brokerRole = 'ProjectX Executive Partner';
    let brokerImg = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
    
    if (l.broker_id) {
        const brokerProfile = await getProfile(l.broker_id);
        if (brokerProfile) {
            if (brokerProfile.full_name) brokerName = brokerProfile.full_name;
            if (brokerProfile.role) brokerRole = `${brokerProfile.role}, ProjectX`;
        }
    }
    
    const brokerNameEl = document.getElementById('detail-broker-name');
    if (brokerNameEl) {
        if (l.broker_id) {
            brokerNameEl.innerHTML = `<a href="/profile.html?id=${l.broker_id}" target="_blank" class="hover:text-slate-600 hover:underline flex items-center gap-1 transition-colors">
                ${escHtml(brokerName)}
                <span class="material-symbols-outlined text-[16px] inline-block font-normal">open_in_new</span>
            </a>`;
        } else {
            brokerNameEl.textContent = brokerName;
        }
    }
    
    const brokerRoleEl = document.getElementById('detail-broker-role');
    if (brokerRoleEl) brokerRoleEl.textContent = brokerRole;

    const brokerImgEl = document.getElementById('detail-broker-img');
    if (brokerImgEl) {
        if (brokerName.toLowerCase().includes('mehdi')) {
            brokerImgEl.src = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80';
        } else {
            brokerImgEl.src = brokerImg;
        }
        if (l.broker_id) {
            brokerImgEl.classList.add('cursor-pointer', 'hover:opacity-95', 'transition-opacity');
            brokerImgEl.onclick = () => {
                window.open(`/profile.html?id=${l.broker_id}`, '_blank');
            };
        }
    }

    // Dynamic Verified Rating display
    const detailRatingEl = document.getElementById('detail-broker-rating-container');
    if (detailRatingEl) {
        if (l.broker_id) {
            const ratingSummary = await getUserRatingSummary(l.broker_id);
            if (ratingSummary.count > 0) {
                detailRatingEl.innerHTML = `
                    <span class="material-symbols-outlined text-[16px] text-amber-400" style="font-variation-settings: 'FILL' 1;">star</span>
                    <span class="font-black text-slate-900">${ratingSummary.average}</span>
                    <a href="/profile.html?id=${l.broker_id}#reviews-section" class="text-slate-400 hover:text-slate-700 hover:underline transition-colors font-medium text-xs">
                        (${ratingSummary.count} broker review${ratingSummary.count === 1 ? '' : 's'})
                    </a>
                `;
            } else {
                detailRatingEl.innerHTML = `
                    <span class="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px] text-slate-300">verified</span>
                        New Partner · No reviews yet
                    </span>
                `;
            }
        } else {
            detailRatingEl.innerHTML = `
                <span class="text-xs text-slate-400 font-medium">Direct Listing</span>
            `;
        }
    }

    document.title = `${l.title} — ProjectX`;

    // Interactive Media Gallery
    const galleryContainer = document.getElementById('property-gallery-container');
    if (galleryContainer) {
        const mediaRows = await getListingMedia(id);
        const mediaItems = (mediaRows || []).map(row => ({
            url: row.url,
            media_type: row.media_type,
            is_cover: row.is_cover
        }));
        renderInteractiveGallery(galleryContainer, mediaItems, l.img);
    } else {
        const heroImg = document.querySelector('.hero-img');
        if (heroImg) heroImg.src = l.img || MEDIA_PLACEHOLDER;
    }

    // Price
    const priceEl = document.getElementById('detail-price');
    if (priceEl) priceEl.innerHTML = formatListingPrice(l.price, l.intent, { html: true });

    // Title & address
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = l.title;
    const addrEl = document.getElementById('detail-address');
    if (addrEl) addrEl.innerHTML = `<span class="material-symbols-outlined text-[20px]">location_on</span> ${l.location}`;

    // Specs
    const bedsEl = document.getElementById('detail-beds');
    if (bedsEl) bedsEl.textContent = l.beds;
    const bathsEl = document.getElementById('detail-baths');
    if (bathsEl) bathsEl.textContent = l.baths;
    const sqftEl = document.getElementById('detail-sqft');
    if (sqftEl) sqftEl.textContent = (l.sqft || 0).toLocaleString();
    const typeEl = document.getElementById('detail-type');
    if (typeEl) typeEl.textContent = l.type;
    
    const listedDateEl = document.getElementById('detail-listed-date');
    const daysOldEl = document.getElementById('detail-days-old');
    if (listedDateEl && daysOldEl) {
        const age = calculateListingAge(l.created_at);
        listedDateEl.textContent = age.date;
        daysOldEl.textContent = age.label || 'Listed Date';
    }

    const viewsEl = document.getElementById('detail-views');
    if (viewsEl) viewsEl.textContent = (l.views || 0).toLocaleString('en-IN');

    const reportBtn = document.getElementById('report-listing-btn');
    if (reportBtn) {
        reportBtn.onclick = () => {
            window.openReportModal('listing', l.id, l.title);
        };
    }

    // Description
    const descEl = document.getElementById('detail-desc');
    if (descEl) {
        descEl.innerHTML = `<p>This exquisite ${l.type.toLowerCase()} located in ${l.location} offers a premium living experience with ${l.beds} spacious bedrooms and ${l.baths} modern bathrooms. Spanning ${(l.sqft || 0).toLocaleString()} sqft, the property features high-end finishes, abundant natural light, and breathtaking views.</p>
        <p>Perfect for those seeking luxury and comfort, this home includes state-of-the-art amenities and is situated in a prime neighborhood with easy access to the city's best attractions.</p>`;
    }

    const photoBtn = Array.from(document.querySelectorAll('span, div')).find((s) => s.textContent.includes('View All 24 Photos'))?.closest('div');
    if (photoBtn) {
        photoBtn.classList.add('cursor-pointer');
        photoBtn.addEventListener('click', () => showToast('Additional photos are demo-only in this build.'));
    }

    // Inquiry vs Chat logic
    const user = await getCurrentUser();
    const role = localStorage.getItem('role');
    
    const form = document.getElementById('buyer-inquiry-form');
    const chatSection = document.getElementById('buyer-chat-section');
    const submitBtn = document.getElementById('contact-agent-btn');

    if (isSoldOut) {
        if (chatSection) chatSection.classList.add('hidden');
        if (form) form.classList.remove('hidden');
    } else if (user && role === 'Buyer') {
        if (form) form.classList.add('hidden');
        if (chatSection) {
            chatSection.classList.remove('hidden');
            chatSection.classList.add('flex');
            initBuyerChat(user.id, l.broker_id, l.id, brokerName);
        }
    } else {
        // Fallback to inquiry form for guests/others
        if (form && submitBtn) {
            ['buyer-first-name', 'buyer-last-name', 'buyer-email', 'buyer-phone'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn.click(); });
            });

            submitBtn.onclick = async (e) => {
                e.preventDefault();
                const firstName = document.getElementById('buyer-first-name')?.value?.trim();
                const email = document.getElementById('buyer-email')?.value?.trim();
                const message = document.getElementById('buyer-message')?.value?.trim();

                if (!firstName || !email || !message) {
                    showToast('Please fill in required fields: First Name, Email, and Message.');
                    return;
                }

                const fullName = `${firstName} ${document.getElementById('buyer-last-name')?.value || ''}`.trim();

                if (hasProfanity(firstName) || hasProfanity(fullName) || hasProfanity(message)) {
                    showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
                    return;
                }

                const phone = document.getElementById('buyer-phone')?.value?.trim();
                const type = document.getElementById('inquiry-type')?.value || 'Inquiry';
                const finalMessage = phone ? `${message} (Contact: ${phone})` : message;

                try {
                    await createInquiry({
                        name: fullName,
                        message: finalMessage,
                        type: type,
                        read: false,
                        listing_id: l.id,
                        broker_id: l.broker_id
                    });
                    showToast('Inquiry submitted successfully. Broker will contact you soon.');
                    form.reset();
                } catch (err) {
                    showToast('Error submitting inquiry: ' + err.message);
                }
            };
        }
    }
}
