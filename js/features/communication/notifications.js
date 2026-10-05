/**
 * Notifications Feature
 * Renders notifications, manages badge counts, and handles status change logging.
 */

import { supabase } from '../../core/supabase-client.js';
import {
    getNotifications,
    getUnreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    sendBrokerNotification as serviceSendBrokerNotification,
    logListingStatusChange as serviceLogListingStatusChange,
    subscribeToNotifications
} from '../../services/notification-service.js';
import { showToast } from '../../ui/toast.js';

let notificationsUnsubscribe = null;

export async function logListingStatusChange(listingId, oldStatus, newStatus, reason) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session && session.user ? session.user.id : null;
        await serviceLogListingStatusChange(listingId, userId, oldStatus, newStatus, reason);
    } catch (err) {
        console.error('Failed to log listing status change:', err);
    }
}

export async function sendBrokerNotification(brokerId, listingTitle, oldStatus, newStatus, reason) {
    try {
        await serviceSendBrokerNotification(brokerId, listingTitle, oldStatus, newStatus, reason);
    } catch (err) {
        console.error('Failed to send broker notification:', err);
    }
}

export async function updateSidebarNotificationsBadge() {
    const badge = document.getElementById('unread-notifications-badge');
    const mobileBadge = document.getElementById('mobile-unread-notifications-badge');
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user) return;

        const count = await getUnreadNotificationCount(session.user.id);

        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
                badge.classList.add('inline-block');
            } else {
                badge.classList.add('hidden');
                badge.classList.remove('inline-block');
            }
        }
        if (mobileBadge) {
            if (count > 0) {
                mobileBadge.textContent = count;
                mobileBadge.classList.remove('hidden');
                mobileBadge.classList.add('flex');
            } else {
                mobileBadge.classList.add('hidden');
                mobileBadge.classList.remove('flex');
            }
        }
    } catch (err) {
        console.error('Failed to update notifications badge:', err);
    }
}

export async function initNotificationsManager() {
    const listContainer = document.getElementById('notifications-list-container');
    if (!listContainer) return;

    const markAllReadBtn = document.getElementById('mark-all-read-btn');

    const renderNotifications = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !session.user) return;
            const userId = session.user.id;

            const notifications = await getNotifications(userId);

            if (!notifications || notifications.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center text-slate-400 py-10 font-medium flex flex-col items-center gap-2">
                        <span class="material-symbols-outlined text-[40px] text-slate-300">notifications_off</span>
                        <span>No notifications yet.</span>
                    </div>`;
                return;
            }

            listContainer.innerHTML = notifications.map(notif => {
                const dateStr = notif.created_at ? new Date(notif.created_at).toLocaleString('en-IN') : '—';
                const unreadClass = notif.read ? 'bg-white opacity-80 border-slate-100' : 'bg-slate-50/70 border-primary-container border-l-4 ring-1 ring-primary-container/20';
                return `
                    <div class="p-4 rounded-xl border transition-all ${unreadClass} flex flex-col md:flex-row justify-between items-start md:items-center gap-4" data-id="${notif.id}">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="material-symbols-outlined text-[18px] text-primary">${notif.read ? 'notifications' : 'notifications_active'}</span>
                                <h4 class="font-bold text-slate-900 text-sm">${notif.title || 'Notification'}</h4>
                                ${notif.read ? '' : '<span class="bg-primary text-on-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">New</span>'}
                            </div>
                            <p class="text-xs md:text-sm text-slate-600 font-medium">${notif.message || ''}</p>
                            <span class="text-[10px] text-slate-400 font-normal mt-2 block">${dateStr}</span>
                        </div>
                        ${notif.read ? '' : `
                            <button class="mark-single-read-btn text-xs font-semibold text-primary hover:underline flex items-center gap-1 whitespace-nowrap bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors" data-id="${notif.id}">
                                <span class="material-symbols-outlined text-[14px]">done</span>
                                Mark read
                            </button>
                        `}
                    </div>
                `;
            }).join('');

            // Wire up single read buttons
            listContainer.querySelectorAll('.mark-single-read-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    try {
                        await markNotificationRead(id);
                        await renderNotifications();
                        await updateSidebarNotificationsBadge();
                    } catch (error) {
                        showToast('Error marking notification as read: ' + error.message, true);
                    }
                };
            });

        } catch (err) {
            console.error('Failed to render notifications:', err);
            listContainer.innerHTML = `<div class="text-error font-medium py-4 text-center">Failed to load notifications.</div>`;
        }
    };

    if (markAllReadBtn) {
        markAllReadBtn.onclick = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session || !session.user) return;
                await markAllNotificationsRead(session.user.id);
                showToast('All notifications marked as read.');
                await renderNotifications();
                await updateSidebarNotificationsBadge();
            } catch (err) {
                showToast('Error marking notifications as read: ' + err.message, true);
            }
        };
    }

    await renderNotifications();
    await updateSidebarNotificationsBadge();

    // Clean up previous subscription if any
    if (notificationsUnsubscribe) {
        notificationsUnsubscribe();
        notificationsUnsubscribe = null;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
        notificationsUnsubscribe = subscribeToNotifications(session.user.id, async () => {
            const notifTab = document.getElementById('tab-notifications');
            if (notifTab && !notifTab.classList.contains('hidden')) {
                await renderNotifications();
            } else {
                await updateSidebarNotificationsBadge();
            }
        });
    }
}

// Preserve global window bindings
window.logListingStatusChange = logListingStatusChange;
window.sendBrokerNotification = sendBrokerNotification;
window.updateSidebarNotificationsBadge = updateSidebarNotificationsBadge;
window.initNotificationsManager = initNotificationsManager;
