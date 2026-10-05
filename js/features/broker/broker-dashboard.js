/**
 * Broker Dashboard Feature
 * Coordinates tabs, metrics, portfolio export, referral links, and live event channels.
 */

import { supabase } from '../../core/supabase-client.js';
import { getListings } from '../../services/listing-service.js';
import { getInquiries } from '../../services/inquiry-service.js';
import { showToast } from '../../ui/toast.js';
import { loadAndApplyBrokerProfileDisplay } from '../user/profile.js';
import { openListingModal, initListingsManager } from '../listings/listing-management.js';
import { initInquiriesManager } from './inquiry-management.js';
import { initCustomFiltersManager } from './custom-filters.js';
import { initNotificationsManager } from '../communication/notifications.js';
import {
    initBrokerChat,
    updateSidebarMessagesBadge,
    unreadConversations,
    currentChatConversation,
    activeChatNames
} from '../communication/chat.js';

let globalBrokerChatUnsubscribe = null;

export function activateBrokerTab(hash) {
    if (!hash || !hash.startsWith('#')) return;
    if (hash === '#settings-section') {
        hash = '#overview-section';
        history.replaceState(null, '', hash);
    }

    const sidebarLinks = document.querySelectorAll('#broker-sidebar a');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

    const targetLink = Array.from(sidebarLinks).find(l => l.getAttribute('href') === hash);
    if (!targetLink) return;

    // Active state management (Sidebar links)
    sidebarLinks.forEach(l => {
        l.classList.remove('bg-white', 'text-slate-900', 'shadow-sm', 'ring-1', 'ring-slate-200');
        l.classList.add('text-slate-500', 'hover:bg-slate-100', 'hover:text-slate-900');
        l.setAttribute('aria-selected', 'false');
    });
    targetLink.classList.add('bg-white', 'text-slate-900', 'shadow-sm', 'ring-1', 'ring-slate-200');
    targetLink.classList.remove('text-slate-500', 'hover:bg-slate-100', 'hover:text-slate-900');
    targetLink.setAttribute('aria-selected', 'true');

    // Active state management (Mobile Nav buttons)
    mobileNavBtns.forEach(btn => {
        if (btn.getAttribute('data-tab') === hash) {
            btn.classList.add('active-mobile-tab');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active-mobile-tab');
            btn.setAttribute('aria-selected', 'false');
        }
    });

    // Section handling
    const targetId = 'tab-' + hash.substring(1).replace('-section', '');

    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('block', 'flex');
    });

    // Show target tab
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        targetEl.classList.remove('hidden');
        if (targetId === 'tab-messages') {
            targetEl.classList.add('flex');
            initBrokerChat();
        } else {
            targetEl.classList.add('block');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Preserve global window binding
window.activateBrokerTab = activateBrokerTab;

export async function initBrokerDashboardPage() {
    loadAndApplyBrokerProfileDisplay().then(() => {
        const brokerName = localStorage.getItem('userName');
        if (brokerName) {
            const greeting = document.querySelector('main header p');
            if (greeting) greeting.textContent = `Welcome back, ${brokerName}. Here is your portfolio performance.`;
        }
    });

    // Setup Broker Referral Program
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const userId = session.user.id;
        const referralUrl = `${window.location.origin}/login.html?ref=${userId}&role=broker`;

        const linkInput = document.getElementById('referral-link-input');
        if (linkInput) linkInput.value = referralUrl;

        const copyBtn = document.getElementById('copy-referral-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(referralUrl).then(() => {
                    showToast('Referral link copied to clipboard!');
                }).catch(() => {
                    showToast('Failed to copy referral link.', true);
                });
            };
        }

        // Load referral stats
        const loadReferralStats = async () => {
            const { data: referredUsers, error } = await supabase
                .from('profiles')
                .select('id, role')
                .eq('referred_by', userId);

            if (!error && referredUsers) {
                const invitedCount = referredUsers.length;
                const activeCount = referredUsers.filter(u => u.role === 'Buyer' || u.role === 'Broker').length;

                const invitedEl = document.getElementById('invited-count');
                const activeEl = document.getElementById('active-referred-count');
                if (invitedEl) invitedEl.textContent = invitedCount;
                if (activeEl) activeEl.textContent = activeCount;
            }
        };
        await loadReferralStats();
    }

    // Sidebar Logout
    const sidebarLogout = document.getElementById('sidebar-logout-btn');
    if (sidebarLogout) sidebarLogout.addEventListener('click', window.logout);

    // Sidebar Add Listing
    const sidebarAddBtn = document.getElementById('sidebar-add-listing-btn');
    if (sidebarAddBtn) sidebarAddBtn.addEventListener('click', () => openListingModal(null));

    // Sidebar & Mobile Navigation Interactivity
    const sidebarLinks = document.querySelectorAll('#broker-sidebar a');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

    // Activate correct tab on load based on hash (default to overview)
    activateBrokerTab(window.location.hash || '#overview-section');

    // Sidebar link click listeners
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                e.stopPropagation();
                history.pushState(null, '', href);
                activateBrokerTab(href);
            }
        });
    });

    // Mobile bottom nav button click listeners
    mobileNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const hash = btn.getAttribute('data-tab');
            if (hash && hash.startsWith('#')) {
                e.preventDefault();
                e.stopPropagation();
                history.pushState(null, '', hash);
                activateBrokerTab(hash);
            }
        });
    });

    // Listen for history popstate events (browser back/forward)
    window.addEventListener('popstate', () => {
        activateBrokerTab(window.location.hash || '#overview-section');
    });

    // Header Actions - Excel Report Export
    const downloadBtn = Array.from(document.querySelectorAll('header button')).find(b =>
        b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'download'
    );
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const { data: { user } } = await supabase.auth.getUser();
            let listings = await getListings();
            if (user) {
                listings = listings.filter(l => l.broker_id === user.id);
            }
            const inquiries = await getInquiries();
            const brokerName = localStorage.getItem('userName') || 'Broker';
            const generatedAt = new Date().toLocaleString('en-IN');

            const xmlHeader = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;

            const xmlFooter = `</Workbook>`;

            const escXml = (val) => String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const makeSheet = (name, headers, rows) => `
  <Worksheet ss:Name="${escXml(name)}">
    <Table>
      <Row>${headers.map(h => `<Cell><Data ss:Type="String">${escXml(h)}</Data></Cell>`).join('')}</Row>
      ${rows.map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${escXml(cell)}</Data></Cell>`).join('')}</Row>`).join('')}
    </Table>
  </Worksheet>`;

            const listingHeaders = ['ID', 'Title', 'Location', 'Price (Cr)', 'Intent', 'Type', 'Status', 'Beds', 'Baths', 'SqFt', 'Views', 'Listed On'];
            const listingRows = listings.map(l => [
                l.id,
                l.title,
                l.location,
                l.price,
                l.intent,
                l.type,
                l.status,
                l.beds,
                l.baths,
                l.sqft,
                l.views || 0,
                l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN') : '—'
            ]);

            const inquiryHeaders = ['ID', 'Name', 'Message', 'Type', 'Read', 'Broker Reply', 'Received At'];
            const inquiryRows = inquiries.map(i => [
                i.id,
                i.name,
                i.message,
                i.type,
                i.read ? 'Yes' : 'No',
                i.broker_reply || '',
                i.created_at ? new Date(i.created_at).toLocaleDateString('en-IN') : '—'
            ]);

            const summaryHeaders = ['Field', 'Value'];
            const summaryRows = [
                ['Broker', brokerName],
                ['Generated At', generatedAt],
                ['Total Listings', listings.length],
                ['Total Inquiries', inquiries.length],
                ['Total Views', listings.reduce((sum, l) => sum + (l.views || 0), 0)],
            ];

            const xmlContent = [
                xmlHeader,
                makeSheet('Summary', summaryHeaders, summaryRows),
                makeSheet('Listings', listingHeaders, listingRows),
                makeSheet('Inquiries', inquiryHeaders, inquiryRows),
                xmlFooter
            ].join('\n');

            const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `estatepro-broker-report-${new Date().toISOString().slice(0, 10)}.xls`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Portfolio report exported as Excel.');
        });
    }

    const dateFilter = document.querySelector('header .relative button');
    if (dateFilter) {
        const ranges = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days'];
        let rangeIdx = 1;
        dateFilter.addEventListener('click', () => {
            rangeIdx = (rangeIdx + 1) % ranges.length;
            const textNodes = Array.from(dateFilter.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            const rangeTextNode = textNodes.find(n => n.textContent.trim().length > 0);
            if (rangeTextNode) rangeTextNode.textContent = ` ${ranges[rangeIdx]} `;
            showToast(`Filter changed to ${ranges[rangeIdx]}`);
        });
    }

    // View All Buttons
    const viewAllListings = document.getElementById('view-all-listings-btn');
    if (viewAllListings) {
        viewAllListings.addEventListener('click', () => {
            history.pushState(null, '', '#listings-section');
            activateBrokerTab('#listings-section');
        });
    }

    const viewAllMessages = document.getElementById('view-all-messages-btn');
    if (viewAllMessages) {
        viewAllMessages.addEventListener('click', () => {
            history.pushState(null, '', '#messages-section');
            activateBrokerTab('#messages-section');
        });
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            showToast('Settings saved successfully.');
        });
    }

    // Initialize all sub-managers
    await initListingsManager();
    await initInquiriesManager();
    await initCustomFiltersManager();
    await initNotificationsManager();

    // Global Real-time Message Listener for Broker Dashboard
    if (globalBrokerChatUnsubscribe) {
        globalBrokerChatUnsubscribe();
        globalBrokerChatUnsubscribe = null;
    }

    if (session && session.user) {
        const user = session.user;
        const channelName = `global_broker_chat_notification_${user.id}`;
        const channel = supabase.channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `broker_id=eq.${user.id}`
            }, async (payload) => {
                const msg = payload.new;
                if (msg.sender_id !== user.id) {
                    const isActivelyChatting = currentChatConversation &&
                        currentChatConversation.buyerId === msg.buyer_id &&
                        currentChatConversation.listingId === msg.listing_id &&
                        !document.getElementById('tab-messages')?.classList.contains('hidden');

                    if (!isActivelyChatting) {
                        const { data: buyerProf } = await supabase.from('profiles').select('full_name').eq('id', msg.buyer_id).single();
                        const { data: listingData } = await supabase.from('listings').select('title').eq('id', msg.listing_id).single();

                        const buyerName = buyerProf?.full_name || 'Buyer';
                        const propTitle = listingData?.title || 'Property';

                        activeChatNames[msg.buyer_id] = buyerName;

                        showToast(`💬 New message from ${buyerName} regarding "${propTitle}": "${msg.content}"`);

                        const key = `${msg.buyer_id}-${msg.listing_id}`;
                        unreadConversations.add(key);
                        updateSidebarMessagesBadge();

                        const listEl = document.getElementById('chat-list');
                        if (listEl && !document.getElementById('tab-messages')?.classList.contains('hidden')) {
                            initBrokerChat();
                        }
                    }
                }
            })
            .subscribe();

        globalBrokerChatUnsubscribe = () => {
            supabase.removeChannel(channel);
        };
    }
}
