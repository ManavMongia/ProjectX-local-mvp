/**
 * Deals & Post-Deal Actions Feature Module
 * UI coordination for:
 * 1. My Property view (Owner/Seller & Tenant/Buyer completed properties)
 * 2. Rental Agreement document generation and printing
 * 3. Property Maintenance requests & tickets
 */

import {
    getDealById,
    getDealsForUser,
    getCompletedPropertiesForUser,
    getRentalAgreementData,
    getMaintenanceRequests,
    createMaintenanceRequest,
    updateMaintenanceStatus,
    acknowledgeDealDone,
    seedDealsIfEmpty
} from '../../services/deal-service.js';
import { getCurrentUser } from '../../services/auth-service.js';
import { showToast } from '../../ui/toast.js';

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 1. MY PROPERTY VIEW (Owner & Tenant) ────────────────────────────────────

/**
 * Initializes and renders the "My Property" page for Owner/Seller and Buyer/Tenant.
 */
export async function initMyPropertyPage() {
    const user = await getCurrentUser();
    const currentUserId = user ? user.id : localStorage.getItem('userId');
    const userRole = localStorage.getItem('role') || 'Buyer';

    // Seed deals for testing if empty
    seedDealsIfEmpty(currentUserId, userRole);

    const completedContainer = document.getElementById('my-property-grid');
    const pendingContainer   = document.getElementById('my-pending-deals-grid');
    const emptyState         = document.getElementById('my-property-empty');

    if (!currentUserId) {
        if (completedContainer) {
            completedContainer.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400">
                    <p class="font-bold text-slate-700">Please sign in to view your properties.</p>
                    <a href="/login.html" class="inline-block mt-3 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Sign In</a>
                </div>
            `;
        }
        return;
    }

    const allDeals = await getDealsForUser(currentUserId);
    const completedDeals = allDeals.filter(d => d.status === 'completed');
    const pendingDeals   = allDeals.filter(d => d.status === 'pending');

    // Deduplicate completed properties by listing_id or id
    const seen = new Set();
    const uniqueCompleted = [];
    completedDeals.forEach(d => {
        const key = d.listing_id || d.id;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCompleted.push(d);
        }
    });

    // 1. Render Completed Properties
    if (completedContainer) {
        if (uniqueCompleted.length === 0) {
            completedContainer.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            if (emptyState) emptyState.classList.add('hidden');
            completedContainer.innerHTML = uniqueCompleted.map(deal => {
                const isTenant = String(deal.buyer_id) === String(currentUserId);
                const isOwner  = String(deal.seller_id) === String(currentUserId);

                const counterpartLabel = isTenant ? 'Owner' : 'Tenant';
                const counterpartName  = isTenant 
                    ? (deal.seller_name || deal.seller?.full_name || 'Rahul Sharma')
                    : (deal.buyer_name  || deal.buyer?.full_name  || 'Manav');

                const brokerName = deal.broker_name || deal.broker?.full_name || 'Akshay Ahuja';
                const propImg    = deal.property_img || deal.listing?.img || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80';
                const propTitle  = deal.property_title || deal.listing?.title || 'Residential Property';
                const propLoc    = deal.property_location || deal.listing?.location || 'Mumbai';

                const closedDate = deal.closed_at 
                    ? new Date(deal.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Recent';

                return `
                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group">
                        <!-- Property Image & Badge -->
                        <div class="relative h-48 w-full bg-slate-100 overflow-hidden">
                            <img src="${esc(propImg)}" alt="${esc(propTitle)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div class="absolute top-3 left-3 flex items-center gap-1.5 bg-emerald-500/95 text-white px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-sm">
                                <span class="material-symbols-outlined text-[14px]">verified</span>
                                Deal Completed ✓
                            </div>
                            <div class="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-xs font-bold font-mono">
                                #${String(deal.id).slice(-8)}
                            </div>
                        </div>

                        <!-- Card Body -->
                        <div class="p-6 flex-1 flex flex-col justify-between space-y-4">
                            <div>
                                <h3 class="font-extrabold text-slate-900 text-lg group-hover:text-slate-800 line-clamp-1">${esc(propTitle)}</h3>
                                <p class="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
                                    <span class="material-symbols-outlined text-[15px] text-slate-400">location_on</span>
                                    ${esc(propLoc)}
                                </p>

                                <div class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                                    <div class="p-2.5 bg-slate-50 rounded-xl">
                                        <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block">${counterpartLabel}</span>
                                        <span class="font-bold text-slate-800 truncate block mt-0.5">${esc(counterpartName)}</span>
                                    </div>
                                    <div class="p-2.5 bg-slate-50 rounded-xl">
                                        <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Broker</span>
                                        <span class="font-bold text-slate-800 truncate block mt-0.5">${esc(brokerName)}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Post-Deal Action Buttons -->
                            <div class="pt-2 border-t border-slate-100 flex flex-col gap-2">
                                <div class="grid grid-cols-2 gap-2">
                                    <a href="/rental-agreement.html?dealId=${deal.id}" class="w-full text-center py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors">
                                        <span class="material-symbols-outlined text-[16px]">description</span>
                                        Rental Agreement
                                    </a>
                                    <a href="/maintenance.html?dealId=${deal.id}" class="w-full text-center py-2.5 px-3 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors">
                                        <span class="material-symbols-outlined text-[16px]">build</span>
                                        Maintenance
                                    </a>
                                </div>
                                <div class="text-[11px] text-slate-400 text-center font-medium">
                                    Completed on ${closedDate}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Render In-Progress Deals if container present
    if (pendingContainer) {
        const pendingSection = document.getElementById('my-pending-deals-section');
        if (pendingDeals.length === 0) {
            if (pendingSection) pendingSection.classList.add('hidden');
        } else {
            if (pendingSection) pendingSection.classList.remove('hidden');
            pendingContainer.innerHTML = pendingDeals.map(deal => {
                const propTitle = deal.property_title || deal.listing?.title || 'Property Deal';
                const propLoc   = deal.property_location || deal.listing?.location || '—';
                const ackState  = deal.deal_acknowledgements || {};

                return `
                    <div class="bg-amber-50/50 rounded-2xl border border-amber-200 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2">
                                <span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[13px]">pending</span>
                                    Deal In Progress
                                </span>
                                <span class="text-xs font-mono text-slate-400">#${String(deal.id).slice(-8)}</span>
                            </div>
                            <h4 class="font-extrabold text-slate-900 text-base">${esc(propTitle)}</h4>
                            <p class="text-xs text-slate-500">${esc(propLoc)} · Monthly: ₹${Number(deal.amount || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="window.handleMarkDealDone('${deal.id}', '${currentUserId}')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
                                <span class="material-symbols-outlined text-[16px]">check_circle</span>
                                Mark Deal Done
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// ─── 2. RENTAL AGREEMENT PAGE ────────────────────────────────────────────────

/**
 * Initializes and renders the Rental Agreement page.
 */
export async function initRentalAgreementPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const dealId = urlParams.get('dealId') || urlParams.get('id');

    const errorContainer   = document.getElementById('agreement-error');
    const contentContainer = document.getElementById('agreement-content');
    const loadingContainer = document.getElementById('agreement-loading');

    if (!dealId) {
        if (loadingContainer) loadingContainer.classList.add('hidden');
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-rose-500">error</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Missing Deal Reference</h2>
                    <p class="text-sm text-slate-500 max-w-md mx-auto">No transaction ID was provided in the URL. Please access this agreement from your completed deals or properties.</p>
                    <a href="/index.html" class="inline-block mt-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Return Home</a>
                </div>
            `;
        }
        return;
    }

    const user = await getCurrentUser();
    const currentUserId = user ? user.id : localStorage.getItem('userId');
    const userRole = localStorage.getItem('role') || 'Buyer';

    // Seed if empty so direct links work
    seedDealsIfEmpty(currentUserId, userRole);

    const agreement = await getRentalAgreementData(dealId);

    if (loadingContainer) loadingContainer.classList.add('hidden');

    if (!agreement) {
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-amber-500">lock</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Agreement Not Available</h2>
                    <p class="text-sm text-slate-500 max-w-md mx-auto">This agreement does not exist or the transaction has not yet been marked as completed by the participants.</p>
                    <div class="flex justify-center gap-3 pt-2">
                        <button onclick="window.history.back()" class="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider">Go Back</button>
                    </div>
                </div>
            `;
        }
        return;
    }

    // Security check: User must be one of the participants
    const isParticipant = !currentUserId || (
        String(agreement.broker.id) === String(currentUserId) ||
        String(agreement.tenant.id) === String(currentUserId) ||
        String(agreement.owner.id)  === String(currentUserId) ||
        userRole === 'Admin' || userRole === 'Employee'
    );

    if (!isParticipant) {
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-rose-500">gpp_bad</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Access Denied</h2>
                    <p class="text-sm text-slate-500 max-w-md mx-auto">You are not a registered participant in this transaction. Rental agreements are strictly confidential between Owner, Tenant, and Broker.</p>
                    <a href="/index.html" class="inline-block mt-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Back to Safety</a>
                </div>
            `;
        }
        return;
    }

    if (contentContainer) {
        contentContainer.classList.remove('hidden');
    }

    // Populate agreement fields
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('agr-number', agreement.agreementId);
    setText('agr-date', new Date(agreement.closedAt || agreement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
    
    // Property
    setText('agr-prop-title', agreement.propertyTitle);
    setText('agr-prop-address', agreement.propertyAddress);
    setText('agr-prop-type', agreement.propertyType);

    // Parties
    setText('agr-owner-name', agreement.owner.name);
    setText('agr-owner-phone', agreement.owner.phone);
    setText('agr-owner-email', agreement.owner.email);

    setText('agr-tenant-name', agreement.tenant.name);
    setText('agr-tenant-phone', agreement.tenant.phone);
    setText('agr-tenant-email', agreement.tenant.email);

    setText('agr-broker-name', agreement.broker.name);
    setText('agr-broker-phone', agreement.broker.phone);
    setText('agr-broker-email', agreement.broker.email);

    // Financial
    const rentStr = `₹${Number(agreement.monthlyRent).toLocaleString('en-IN')}`;
    const depositStr = `₹${Number(agreement.securityDeposit).toLocaleString('en-IN')}`;
    setText('agr-monthly-rent', rentStr);
    setText('agr-deposit', depositStr);

    // Dates
    const startDateStr = new Date(agreement.agreementStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const endDateStr = new Date(agreement.agreementEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    setText('agr-term-duration', `${agreement.durationMonths} Months (${startDateStr} to ${endDateStr})`);

    // Wire actions
    const maintLink = document.getElementById('agr-maint-link');
    if (maintLink) maintLink.href = `/maintenance.html?dealId=${agreement.transactionId}`;

    const printBtn = document.getElementById('agr-print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => window.print());
    }
}

// ─── 3. MAINTENANCE PAGE ─────────────────────────────────────────────────────

/**
 * Initializes and coordinates the Maintenance page.
 */
export async function initMaintenancePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const dealId = urlParams.get('dealId') || urlParams.get('id');

    const errorContainer   = document.getElementById('maint-error');
    const contentContainer = document.getElementById('maint-content');
    const loadingContainer = document.getElementById('maint-loading');

    if (!dealId) {
        if (loadingContainer) loadingContainer.classList.add('hidden');
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-rose-500">error</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Missing Deal Reference</h2>
                    <p class="text-sm text-slate-500 max-w-md mx-auto">No transaction ID was provided. Please navigate to maintenance from your completed property or deal.</p>
                </div>
            `;
        }
        return;
    }

    const user = await getCurrentUser();
    const currentUserId = user ? user.id : localStorage.getItem('userId');
    const userRole = localStorage.getItem('role') || 'Buyer';

    // Seed sample deals if empty
    seedDealsIfEmpty(currentUserId, userRole);

    const deal = await getDealById(dealId);

    if (loadingContainer) loadingContainer.classList.add('hidden');

    if (!deal) {
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-amber-500">search_off</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Deal Not Found</h2>
                    <p class="text-sm text-slate-500">Could not find transaction #${dealId}.</p>
                </div>
            `;
        }
        return;
    }

    // Security check: Only verified participants can access maintenance
    const isParticipant = !currentUserId || (
        String(deal.broker_id) === String(currentUserId) ||
        String(deal.buyer_id)  === String(currentUserId) ||
        String(deal.seller_id) === String(currentUserId) ||
        userRole === 'Admin' || userRole === 'Employee'
    );

    if (!isParticipant) {
        if (errorContainer) {
            errorContainer.classList.remove('hidden');
            errorContainer.innerHTML = `
                <div class="p-8 text-center space-y-4">
                    <span class="material-symbols-outlined text-4xl text-rose-500">security</span>
                    <h2 class="text-xl font-extrabold text-slate-900">Access Denied</h2>
                    <p class="text-sm text-slate-500 max-w-md mx-auto">Unauthorized: You do not have permission to access maintenance records for this property.</p>
                    <a href="/index.html" class="inline-block mt-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider">Back to Safety</a>
                </div>
            `;
        }
        return;
    }

    if (contentContainer) contentContainer.classList.remove('hidden');

    // Populate property header
    const propTitle = deal.property_title || deal.listing?.title || 'Residential Property';
    const propLoc   = deal.property_location || deal.listing?.location || 'Mumbai';
    const setText   = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    setText('maint-prop-title', propTitle);
    setText('maint-prop-loc', propLoc);
    setText('maint-deal-id', `#${String(deal.id).slice(-8)}`);

    const agrLink = document.getElementById('maint-agreement-link');
    if (agrLink) agrLink.href = `/rental-agreement.html?dealId=${deal.id}`;

    // Render requests list
    async function loadRequests() {
        const listContainer = document.getElementById('maint-requests-list');
        const emptyState    = document.getElementById('maint-empty-state');
        if (!listContainer) return;

        const requests = await getMaintenanceRequests(dealId);

        if (requests.length === 0) {
            listContainer.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        listContainer.innerHTML = requests.map(req => {
            const statusColors = {
                open:        'bg-amber-50 text-amber-700 border-amber-200',
                in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
                resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
                closed:      'bg-slate-50 text-slate-700 border-slate-200'
            };
            const priorityColors = {
                Low:    'bg-slate-100 text-slate-700',
                Medium: 'bg-yellow-100 text-yellow-800',
                High:   'bg-orange-100 text-orange-800',
                Urgent: 'bg-red-100 text-red-800'
            };

            const createdDate = new Date(req.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });

            const requesterName = req.requester_name || req.requester?.full_name || 'Participant';
            const requesterRole = req.requester_role || req.requester?.role || 'Tenant';

            return `
                <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
                    <div class="flex items-start justify-between gap-4">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColors[req.status] || statusColors.open} uppercase tracking-wider">
                                    ${req.status.replace('_', ' ')}
                                </span>
                                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${priorityColors[req.priority] || priorityColors.Medium}">
                                    ${req.priority} Priority
                                </span>
                                <span class="text-xs text-slate-400 font-medium">· Category: <strong class="text-slate-700">${esc(req.category)}</strong></span>
                            </div>
                            <h4 class="font-extrabold text-base text-slate-900 mt-1">${esc(req.title)}</h4>
                        </div>

                        <!-- Status update dropdown -->
                        <div class="shrink-0">
                            <select onchange="window.handleUpdateMaintStatus('${req.id}', this.value)" class="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 outline-none hover:border-slate-300 cursor-pointer">
                                <option value="open" ${req.status === 'open' ? 'selected' : ''}>Open</option>
                                <option value="in_progress" ${req.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="resolved" ${req.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                            </select>
                        </div>
                    </div>

                    ${req.description ? `<p class="text-sm text-slate-600 leading-relaxed">${esc(req.description)}</p>` : ''}

                    <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <div class="flex items-center gap-1.5 font-medium">
                            <span class="material-symbols-outlined text-[15px] text-slate-400">person</span>
                            Raised by <strong class="text-slate-700">${esc(requesterName)}</strong> (${esc(requesterRole)})
                        </div>
                        <div>${createdDate}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.handleUpdateMaintStatus = async function(requestId, newStatus) {
        try {
            await updateMaintenanceStatus(requestId, newStatus);
            showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
            await loadRequests();
        } catch (err) {
            showToast(err.message || 'Failed to update status', 'error');
        }
    };

    // Wire "Create Request" modal & form
    const createBtn = document.getElementById('create-maint-btn');
    const modal     = document.getElementById('maint-modal');
    const cancelBtn = document.getElementById('maint-modal-cancel');
    const form      = document.getElementById('maint-form');

    if (createBtn && modal) {
        createBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        });
    }

    if (cancelBtn && modal) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const titleEl    = document.getElementById('maint-input-title');
            const descEl     = document.getElementById('maint-input-desc');
            const catEl      = document.getElementById('maint-input-category');
            const priorityEl = document.getElementById('maint-input-priority');

            const title       = titleEl ? titleEl.value.trim() : '';
            const description = descEl ? descEl.value.trim() : '';
            const category    = catEl ? catEl.value : 'General';
            const priority    = priorityEl ? priorityEl.value : 'Medium';

            if (!title) {
                showToast('Please enter a request title', 'error');
                return;
            }

            try {
                await createMaintenanceRequest({
                    transactionId: dealId,
                    requesterId:   currentUserId || crypto.randomUUID(),
                    title,
                    description,
                    category,
                    priority
                });

                showToast('Maintenance request created successfully!', 'success');
                if (modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }
                form.reset();
                await loadRequests();
            } catch (err) {
                showToast(err.message || 'Failed to create request', 'error');
            }
        });
    }

    await loadRequests();
}
