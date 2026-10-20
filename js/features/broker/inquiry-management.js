/**
 * Broker Inquiry & Lead Status Management Feature Module
 * Controls leads list rendering, status dropdowns, filters, detail modal, and reply messaging.
 */

import {
    getInquiries,
    getInquiryById,
    updateLeadStatus,
    replyToInquiry,
    markInquiryRead,
    normalizeLeadStatus,
    LEAD_STATUS_OPTIONS,
    LEAD_STATUS_BADGE_CLASSES
} from '../../services/inquiry-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { hasProfanity } from '../../services/moderation-service.js';
import { updateTrendBadge } from '../listings/listing-management.js';
import { showToast } from '../../ui/toast.js';

let activeInquiryId = null;
let currentLeadStatusFilter = 'All';
let currentLeadSearchQuery = '';
const updatingLeads = new Set();

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extractContactInfo(message) {
    if (!message) return null;
    const match = message.match(/\(Contact:\s*([^)]+)\)/i);
    return match ? match[1].trim() : null;
}

function cleanMessageText(message) {
    if (!message) return '';
    return message.replace(/\(Contact:\s*[^)]+\)/i, '').trim();
}

/**
 * Returns dot indicator color corresponding to lead status for visual clarity.
 */
function getStatusDotColor(status) {
    switch (status) {
        case 'New Lead': return 'bg-blue-600';
        case 'Site Visit Requested': return 'bg-purple-600';
        case 'Site Visit Done': return 'bg-emerald-600';
        case 'Follow-up': return 'bg-amber-600';
        case 'Not Interested': return 'bg-slate-400';
        default: return 'bg-blue-600';
    }
}

/**
 * Main render function for Leads and Recent Inquiries.
 */
export async function renderInquiries() {
    const user = await getCurrentUser();
    const brokerId = user ? user.id : null;

    // Fetch all inquiries belonging to broker (or all if admin)
    const allInquiries = await getInquiries(brokerId);

    // Update KPI leads count
    const contactsEl = document.getElementById('stat-new-contacts');
    if (contactsEl) {
        contactsEl.textContent = allInquiries.length.toLocaleString();
    }

    // Update KPI trend badge
    updateTrendBadge(allInquiries, 'stat-leads-trend', 'created_at');

    // Unread badge count
    const unreadCount = allInquiries.filter(i => !i.read).length;
    const badge = document.getElementById('new-inquiries-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = `${unreadCount} New`;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // 1. Render Recent Inquiries Widget (Home tab)
    const listWidget = document.getElementById('inquiries-list-widget');
    if (listWidget) {
        const recentSlice = allInquiries.slice(0, 5);
        listWidget.innerHTML = recentSlice.length ? recentSlice.map(i => {
            const status = normalizeLeadStatus(i.lead_status);
            const badgeClass = LEAD_STATUS_BADGE_CLASSES[status] || LEAD_STATUS_BADGE_CLASSES['New Lead'];
            const dotColor = getStatusDotColor(status);

            return `
            <div onclick="openInquiry(${i.id})" class="p-3 hover:bg-surface-container rounded-lg cursor-pointer transition-colors border-b border-surface-variant last:border-0 relative ${!i.read ? 'bg-primary-fixed/5' : ''}">
              ${!i.read ? '<div class="absolute left-2 top-4 w-2 h-2 rounded-full bg-primary animate-pulse"></div>' : ''}
              <div class="ml-4">
                <div class="flex justify-between items-start mb-1">
                  <h4 class="font-body-md text-body-md ${!i.read ? 'font-bold' : 'font-semibold'} text-primary">${escHtml(i.name)}</h4>
                  <span class="text-xs text-on-surface-variant">${new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant truncate mb-2">${escHtml(cleanMessageText(i.message))}</p>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[10px] font-bold uppercase tracking-wider ${i.type === 'Offer Intent' ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-surface-container text-on-surface-variant'} px-1.5 py-0.5 rounded">${i.type}</span>
                  <span class="${badgeClass} px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                    ${status}
                  </span>
                </div>
              </div>
            </div>`;
        }).join('') : '<div class="p-8 text-center text-slate-400 text-sm">No inquiries yet.</div>';
    }

    // 2. Filter inquiries for Full Leads Tab
    let filteredLeads = [...allInquiries];
    if (currentLeadStatusFilter && currentLeadStatusFilter !== 'All' && currentLeadStatusFilter !== 'All Leads') {
        filteredLeads = filteredLeads.filter(i => normalizeLeadStatus(i.lead_status) === currentLeadStatusFilter);
    }
    if (currentLeadSearchQuery) {
        const q = currentLeadSearchQuery.toLowerCase();
        filteredLeads = filteredLeads.filter(i => {
            const nameMatch = i.name && String(i.name).toLowerCase().includes(q);
            const msgMatch = i.message && String(i.message).toLowerCase().includes(q);
            const propTitleMatch = i.listing && i.listing.title && String(i.listing.title).toLowerCase().includes(q);
            const propLocMatch = i.listing && i.listing.location && String(i.listing.location).toLowerCase().includes(q);
            return nameMatch || msgMatch || propTitleMatch || propLocMatch;
        });
    }

    // 3. Render Full Leads Tab
    const listFull = document.getElementById('inquiries-list-full');
    if (listFull) {
        if (!filteredLeads.length) {
            listFull.innerHTML = `
              <div class="p-12 text-center text-slate-400">
                <span class="material-symbols-outlined text-[48px] text-slate-300 mb-2">person_search</span>
                <p class="text-sm font-medium">No leads match your active filter.</p>
              </div>`;
        } else {
            listFull.innerHTML = filteredLeads.map(i => {
                const status = normalizeLeadStatus(i.lead_status);
                const badgeClass = LEAD_STATUS_BADGE_CLASSES[status] || LEAD_STATUS_BADGE_CLASSES['New Lead'];
                const dotColor = getStatusDotColor(status);
                const contactInfo = extractContactInfo(i.message);
                const cleanMsg = cleanMessageText(i.message);
                const propertyTitle = i.listing?.title || 'General Property Inquiry';
                const propertyLocation = i.listing?.location || '';
                const dateStr = new Date(i.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) + ' at ' + new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return `
                <div class="p-4 hover:bg-surface-container/60 rounded-xl transition-all border border-outline-variant mb-3 bg-surface-bright relative ${!i.read ? 'ring-1 ring-primary/20' : ''}" data-lead-id="${i.id}">
                  <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <!-- Left: Lead details -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap mb-1.5">
                        <h4 class="font-body-md text-base font-bold text-primary truncate">${escHtml(i.name)}</h4>
                        <span id="lead-badge-${i.id}" class="${badgeClass} px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs">
                          <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                          <span class="badge-label">${status}</span>
                        </span>
                        <span class="text-[10px] font-bold uppercase tracking-wider ${i.type === 'Offer Intent' ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-surface-container text-on-surface-variant'} px-2 py-0.5 rounded-full">${i.type}</span>
                        ${!i.read ? '<span class="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full">New Message</span>' : ''}
                      </div>

                      <!-- Associated Property -->
                      <div class="text-xs text-on-surface-variant flex items-center gap-1.5 flex-wrap font-medium mb-1.5">
                        <span class="material-symbols-outlined text-[15px] text-slate-400">real_estate_agent</span>
                        <span class="font-bold text-slate-800 dark:text-slate-200">${escHtml(propertyTitle)}</span>
                        ${propertyLocation ? `<span>• <span class="text-slate-500">${escHtml(propertyLocation)}</span></span>` : ''}
                        <span>• <span class="text-slate-400">${dateStr}</span></span>
                      </div>

                      <!-- Message snippet -->
                      <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-1.5">${escHtml(cleanMsg)}</p>

                      <!-- Contact info if provided -->
                      ${contactInfo ? `
                      <div class="text-[11px] text-slate-500 font-semibold flex items-center gap-1.5 mt-1">
                        <span class="material-symbols-outlined text-[14px] text-emerald-600">call</span>
                        <span class="text-slate-700 dark:text-slate-300 font-mono">${escHtml(contactInfo)}</span>
                      </div>` : ''}

                      ${i.broker_reply ? `
                      <div class="mt-2 text-xs bg-surface-container-low p-2 rounded-lg border border-outline-variant text-slate-700 dark:text-slate-300">
                        <span class="font-bold text-primary">Your Reply:</span> ${escHtml(i.broker_reply)}
                      </div>` : ''}
                    </div>

                    <!-- Right: Dropdown & Action buttons -->
                    <div class="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-outline-variant">
                      <!-- Dropdown with spinner -->
                      <div class="relative w-full sm:w-52">
                        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Status</label>
                        <div class="relative flex items-center">
                          <select class="lead-status-select w-full bg-surface-container border border-outline-variant rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                  data-id="${i.id}" data-current="${status}">
                            ${LEAD_STATUS_OPTIONS.map(opt => `<option value="${opt}" ${opt === status ? 'selected' : ''}>${opt}</option>`).join('')}
                          </select>
                          <div id="lead-saving-spinner-${i.id}" class="hidden absolute right-2.5 pointer-events-none">
                            <span class="material-symbols-outlined text-[16px] animate-spin text-primary">progress_activity</span>
                          </div>
                        </div>
                      </div>

                      <!-- Action Button -->
                      <div class="flex items-center gap-2 pt-0 sm:pt-4 lg:pt-0 xl:pt-4 w-full sm:w-auto">
                        <button onclick="openInquiry(${i.id})" class="w-full sm:w-auto px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center justify-center gap-1" title="View Details & Reply">
                          <span class="material-symbols-outlined text-[16px]">chat</span>
                          <span>Details</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>`;
            }).join('');
        }

        // Bind lead status select dropdown changes
        bindLeadStatusSelects(listFull, user);
    }
}

/**
 * Binds change events on status dropdowns with robust loading states,
 * duplicate update prevention, immediate UI updates, and error rollbacks.
 */
function bindLeadStatusSelects(container, user) {
    container.querySelectorAll('.lead-status-select').forEach(select => {
        select.onchange = async () => {
            const inquiryId = select.getAttribute('data-id');
            const oldStatus = select.getAttribute('data-current');
            const newStatus = select.value;

            if (oldStatus === newStatus) return;

            // Prevent duplicate updates while save is in progress
            if (updatingLeads.has(inquiryId)) return;

            updatingLeads.add(inquiryId);
            select.disabled = true;

            const spinner = document.getElementById(`lead-saving-spinner-${inquiryId}`);
            if (spinner) spinner.classList.remove('hidden');

            try {
                const userRole = localStorage.getItem('role') || 'Broker';
                await updateLeadStatus({
                    inquiryId,
                    newStatus,
                    currentUserId: user ? user.id : null,
                    userRole
                });

                // Update select data attribute
                select.setAttribute('data-current', newStatus);

                // Update badge UI immediately
                const badgeEl = document.getElementById(`lead-badge-${inquiryId}`);
                if (badgeEl) {
                    const newClass = LEAD_STATUS_BADGE_CLASSES[newStatus] || LEAD_STATUS_BADGE_CLASSES['New Lead'];
                    const dotColor = getStatusDotColor(newStatus);
                    badgeEl.className = `${newClass} px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs`;
                    badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span><span class="badge-label">${newStatus}</span>`;
                }

                showToast(`✓ Lead status updated to "${newStatus}"`);

                // If currently filtered by status and updated status no longer matches, re-render
                if (currentLeadStatusFilter !== 'All' && currentLeadStatusFilter !== 'All Leads' && currentLeadStatusFilter !== newStatus) {
                    setTimeout(() => renderInquiries(), 400);
                }
            } catch (err) {
                console.error('Failed to update lead status:', err);
                // Rollback select to previous value
                select.value = oldStatus;

                let friendlyMsg = 'Failed to update lead status. Please try again.';
                if (err.message && (err.message.includes('migration') || err.message.includes('Database schema') || err.message.includes('audit table'))) {
                    friendlyMsg = 'Database update pending. Please run the lead status migration.';
                } else if (err.message && err.message.includes('Unauthorized')) {
                    friendlyMsg = 'Unauthorized: You can only update leads for your own listings.';
                } else if (err.message && err.message.includes('Invalid lead status')) {
                    friendlyMsg = err.message;
                } else if (err.message && !err.message.includes('PGRST') && !err.message.includes('violates') && !err.message.includes('syntax')) {
                    friendlyMsg = err.message;
                }
                showToast(friendlyMsg, true);
            } finally {
                updatingLeads.delete(inquiryId);
                select.disabled = false;
                if (spinner) spinner.classList.add('hidden');
            }
        };
    });
}

/**
 * Sets up status filter tabs and search input.
 */
export function setupLeadsFilters() {
    const tabs = document.querySelectorAll('.lead-status-filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('bg-slate-900', 'text-white');
                t.classList.add('bg-surface-container', 'text-on-surface');
            });
            tab.classList.remove('bg-surface-container', 'text-on-surface');
            tab.classList.add('bg-slate-900', 'text-white');
            currentLeadStatusFilter = tab.getAttribute('data-status');
            renderInquiries();
        });
    });

    const searchInput = document.getElementById('leads-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentLeadSearchQuery = e.target.value.trim();
            renderInquiries();
        });
    }
}

/**
 * Opens Inquiry detail and reply modal.
 */
export async function openInquiry(id) {
    const inquiry = await getInquiryById(id);
    if (!inquiry) return;

    if (!inquiry.read) {
        await markInquiryRead(id);
        await renderInquiries();
    }

    const modal = document.getElementById('inquiry-details-modal');
    if (!modal) return;

    const status = normalizeLeadStatus(inquiry.lead_status);
    const badgeClass = LEAD_STATUS_BADGE_CLASSES[status] || LEAD_STATUS_BADGE_CLASSES['New Lead'];
    const dotColor = getStatusDotColor(status);

    document.getElementById('inquiry-modal-name').textContent = inquiry.name;
    document.getElementById('inquiry-modal-type').textContent = inquiry.type;
    document.getElementById('inquiry-modal-message').textContent = cleanMessageText(inquiry.message);
    document.getElementById('inquiry-modal-time').textContent = new Date(inquiry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('inquiry-modal-reply').value = inquiry.broker_reply || '';
    
    // Status controls inside detail modal
    const modalStatusContainer = document.getElementById('inquiry-modal-status-container');
    if (modalStatusContainer) {
        modalStatusContainer.innerHTML = `
          <div class="flex items-center justify-between p-3 bg-surface-container-low rounded-lg border border-outline-variant">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
              <span id="modal-status-badge" class="${badgeClass} px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                ${status}
              </span>
            </div>
            <select id="modal-lead-status-select" class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
              ${LEAD_STATUS_OPTIONS.map(opt => `<option value="${opt}" ${opt === status ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
          </div>
        `;

        const modalSelect = document.getElementById('modal-lead-status-select');
        if (modalSelect) {
            modalSelect.onchange = async () => {
                const user = await getCurrentUser();
                const newStatus = modalSelect.value;
                try {
                    modalSelect.disabled = true;
                    await updateLeadStatus({
                        inquiryId: id,
                        newStatus,
                        currentUserId: user ? user.id : null,
                        userRole: localStorage.getItem('role') || 'Broker'
                    });
                    showToast(`✓ Lead status updated to "${newStatus}"`);
                    await renderInquiries();
                    const badgeEl = document.getElementById('modal-status-badge');
                    if (badgeEl) {
                        badgeEl.className = `${LEAD_STATUS_BADGE_CLASSES[newStatus]} px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5`;
                        badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${getStatusDotColor(newStatus)}"></span>${newStatus}`;
                    }
                } catch (err) {
                    modalSelect.value = status;
                    let friendlyMsg = 'Failed to update lead status. Please try again.';
                    if (err.message && (err.message.includes('migration') || err.message.includes('Database schema') || err.message.includes('audit table'))) {
                        friendlyMsg = 'Database update pending. Please run the lead status migration.';
                    } else if (err.message && err.message.includes('Unauthorized')) {
                        friendlyMsg = 'Unauthorized: You can only update leads for your own listings.';
                    } else if (err.message && err.message.includes('Invalid lead status')) {
                        friendlyMsg = err.message;
                    } else if (err.message && !err.message.includes('PGRST') && !err.message.includes('violates') && !err.message.includes('syntax')) {
                        friendlyMsg = err.message;
                    }
                    showToast(friendlyMsg, true);
                } finally {
                    modalSelect.disabled = false;
                }
            };
        }
    }

    activeInquiryId = id;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
window.openInquiry = openInquiry;

export function closeInquiryModal() {
    const modal = document.getElementById('inquiry-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}
window.closeInquiryModal = closeInquiryModal;

export function injectInquiryModal() {
    if (document.getElementById('inquiry-details-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'inquiry-details-modal';
    modal.className = 'hidden fixed inset-0 z-[100] items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-outline-variant">
        <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low">
          <h3 class="font-h3 text-h3 text-primary">Inquiry Details</h3>
          <button onclick="closeInquiryModal()" class="text-slate-400 hover:text-slate-700 transition-colors">
            <span class="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div class="flex justify-between items-start">
            <div>
              <h4 id="inquiry-modal-name" class="text-xl font-bold text-primary">Sarah Jenkins</h4>
              <p id="inquiry-modal-type" class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mt-1">Viewing Request</p>
            </div>
            <span id="inquiry-modal-time" class="text-xs text-slate-400">10:42 AM</span>
          </div>

          <!-- Lead Status Section in Modal -->
          <div id="inquiry-modal-status-container"></div>

          <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant">
            <p id="inquiry-modal-message" class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">"Interested in viewing 123 Luxury Lane this weekend if possible."</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reply Message</label>
            <textarea id="inquiry-modal-reply" class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-fixed" rows="3" placeholder="Type broker reply..."></textarea>
          </div>
          <div class="flex flex-col gap-2 pt-2">
            <button id="reply-inquiry-btn" class="w-full bg-primary text-on-primary py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity">Send Reply</button>
            <button id="schedule-viewing-btn" class="w-full border border-outline-variant text-on-surface-variant py-2.5 rounded-lg font-semibold hover:bg-surface-container transition-colors">Schedule Viewing</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeInquiryModal(); });

    const replyTextarea = document.getElementById('inquiry-modal-reply');
    if (replyTextarea) {
        replyTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                document.getElementById('reply-inquiry-btn')?.click();
            }
        });
    }

    const replyBtn = document.getElementById('reply-inquiry-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', async () => {
            const reply = document.getElementById('inquiry-modal-reply')?.value?.trim();
            if (!activeInquiryId || !reply) {
                showToast('Please enter a reply message.');
                return;
            }
            if (hasProfanity(reply)) {
                showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
                return;
            }
            try {
                await replyToInquiry(activeInquiryId, reply);
                await renderInquiries();
                showToast('Reply sent to buyer.');
            } catch (err) {
                showToast('Error sending reply: ' + err.message);
            }
        });
    }

    const scheduleBtn = document.getElementById('schedule-viewing-btn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => {
            showToast('Viewing request marked for scheduling.');
        });
    }
}

export async function initInquiriesManager() {
    setupLeadsFilters();
    await renderInquiries();
    injectInquiryModal();
}
