/**
 * Reporting & Flagging Feature
 * Injects and manages the issue reporting modal for properties and profiles.
 */

import { getCurrentUser } from '../../services/auth-service.js';
import { submitReport } from '../../services/moderation-service.js';
import { showToast } from '../../ui/toast.js';

export function injectReportModal() {
    if (document.getElementById('report-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'report-modal';
    modal.className = 'hidden fixed inset-0 z-[100] items-center justify-center bg-black/50 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-100 font-sans">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h3 class="text-lg font-black text-slate-900">Report Issue</h3>
            <p class="text-xs text-slate-500 mt-0.5">Help us maintain platform integrity.</p>
          </div>
          <button onclick="closeReportModal()" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="p-6 space-y-4">
          <input type="hidden" id="report-target-type"/>
          <input type="hidden" id="report-target-id"/>
          
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Item</span>
            <p id="report-target-name" class="text-sm font-bold text-slate-900 mt-1 truncate">—</p>
          </div>
          
          <div>
            <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Reason for Report *</label>
            <select id="report-reason" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-slate-900 transition-all">
              <option value="" disabled selected>Select a reason...</option>
              <option value="Fraudulent/Misleading Content">Fraudulent/Misleading Content</option>
              <option value="Inappropriate/Offensive Content">Inappropriate/Offensive Content</option>
              <option value="Spam or Harassment">Spam or Harassment</option>
              <option value="Abusive Behavior">Abusive Behavior</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div>
            <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Additional Details *</label>
            <textarea id="report-description" placeholder="Please describe the issue in detail..." rows="4" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all resize-none"></textarea>
          </div>
          
          <button onclick="submitReportForm()" id="submit-report-btn" class="w-full bg-slate-900 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors mt-2">
            Submit Report
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeReportModal(); });
}

export function closeReportModal() {
    const modal = document.getElementById('report-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}
window.closeReportModal = closeReportModal;

export async function openReportModal(targetType, targetId, targetName) {
    const user = await getCurrentUser();
    if (!user) {
        showToast('Please sign in to file a report.', true);
        window.location.href = '/login.html';
        return;
    }
    
    injectReportModal();
    
    document.getElementById('report-target-type').value = targetType;
    document.getElementById('report-target-id').value = targetId;
    document.getElementById('report-target-name').textContent = targetName;
    document.getElementById('report-reason').value = '';
    document.getElementById('report-description').value = '';
    
    const modal = document.getElementById('report-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
window.openReportModal = openReportModal;

export async function submitReportForm() {
    const targetType = document.getElementById('report-target-type').value;
    const targetId = document.getElementById('report-target-id').value;
    const reason = document.getElementById('report-reason').value;
    const description = document.getElementById('report-description').value.trim();
    const btn = document.getElementById('submit-report-btn');

    if (!reason) {
        showToast('Please select a reason for your report.', true);
        return;
    }
    if (!description) {
        showToast('Please provide some details for the report.', true);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated.');

        await submitReport({
            reporterId: user.id,
            targetType,
            targetId,
            reason,
            description
        });

        showToast('✓ Thank you. Your report has been submitted.');
        closeReportModal();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to submit report.', true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Report';
    }
}
window.submitReportForm = submitReportForm;
