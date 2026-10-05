/**
 * Broker Inquiry Management Feature Module
 * Inquiries list rendering, detail modal, and reply messaging.
 */

import { getInquiries, getInquiryById, replyToInquiry, markInquiryRead } from '../../services/inquiry-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { hasProfanity } from '../../services/moderation-service.js';
import { updateTrendBadge } from '../listings/listing-management.js';
import { showToast } from '../../ui/toast.js';

let activeInquiryId = null;

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function renderInquiries() {
    const user = await getCurrentUser();
    let inquiries = await getInquiries(user ? user.id : null);
    
    // Update leads count
    const contactsEl = document.getElementById('stat-new-contacts');
    if (contactsEl) {
        contactsEl.textContent = inquiries.length.toLocaleString();
    }
    
    // Update KPI trend badge
    updateTrendBadge(inquiries, 'stat-leads-trend', 'created_at');

    const unreadCount = inquiries.filter(i => !i.read).length;
    const badge = document.getElementById('new-inquiries-badge');
    
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = `${unreadCount} New`;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const html = inquiries.length ? inquiries.map(i => `
        <div onclick="openInquiry(${i.id})" class="p-3 hover:bg-surface-container rounded-lg cursor-pointer transition-colors border-b border-surface-variant last:border-0 relative ${!i.read ? 'bg-primary-fixed/5' : ''}">
          ${!i.read ? '<div class="absolute left-2 top-4 w-2 h-2 rounded-full bg-primary animate-pulse"></div>' : ''}
          <div class="ml-4">
            <div class="flex justify-between items-start mb-1">
              <h4 class="font-body-md text-body-md ${!i.read ? 'font-bold' : 'font-semibold'} text-primary">${escHtml(i.name)}</h4>
              <span class="text-xs text-on-surface-variant">${new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate mb-2">${escHtml(i.message)}</p>
            ${i.broker_reply ? `<p class="font-body-sm text-[12px] text-secondary truncate mb-2">Broker: ${escHtml(i.broker_reply)}</p>` : ''}
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase tracking-wider ${i.type === 'Offer Intent' ? 'bg-secondary-fixed text-on-secondary-fixed-variant' : 'bg-surface-container text-on-surface-variant'} px-1.5 py-0.5 rounded">${i.type}</span>
            </div>
          </div>
        </div>
    `).join('') : '<div class="p-8 text-center text-slate-400 text-sm">No inquiries yet.</div>';
    
    const listWidget = document.getElementById('inquiries-list-widget');
    if (listWidget) listWidget.innerHTML = html;
    const listFull = document.getElementById('inquiries-list-full');
    if (listFull) listFull.innerHTML = html;
}

export async function openInquiry(id) {
    const inquiry = await getInquiryById(id);
    if (!inquiry) return;

    if (!inquiry.read) {
        await markInquiryRead(id);
        await renderInquiries();
    }

    const modal = document.getElementById('inquiry-details-modal');
    if (!modal) return;

    document.getElementById('inquiry-modal-name').textContent = inquiry.name;
    document.getElementById('inquiry-modal-type').textContent = inquiry.type;
    document.getElementById('inquiry-modal-message').textContent = inquiry.message;
    document.getElementById('inquiry-modal-time').textContent = new Date(inquiry.created_at).toLocaleTimeString();
    document.getElementById('inquiry-modal-reply').value = inquiry.broker_reply || '';
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
          <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant">
            <p id="inquiry-modal-message" class="text-sm text-slate-700 leading-relaxed italic">"Interested in viewing 123 Luxury Lane this weekend if possible."</p>
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
    await renderInquiries();
    injectInquiryModal();
}
