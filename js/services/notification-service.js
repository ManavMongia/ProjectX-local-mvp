/**
 * Notification Service
 * Pure data operations and realtime subscriptions for user notifications and audit logs.
 * Zero DOM dependencies; provides clean unsubscribe functions for React useEffect.
 */

import { supabase } from '../core/supabase-client.js';

export async function getNotifications(userId) {
    if (!userId) return [];
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }
    return data || [];
}

export async function getUnreadNotificationCount(userId) {
    if (!userId) return 0;
    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

    if (error) {
        console.error('Error counting unread notifications:', error);
        return 0;
    }
    return count || 0;
}

export async function markNotificationRead(id) {
    const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function markAllNotificationsRead(userId) {
    if (!userId) return;
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

    if (error) throw error;
    return true;
}

export async function sendBrokerNotification(brokerId, listingTitle, oldStatus, newStatus, reason) {
    if (!brokerId) return;
    const msg = `Your listing "${listingTitle}" status has been updated from "${oldStatus || 'None'}" to "${newStatus === 'Active' ? 'Approved' : newStatus}".${reason ? ` Reason: ${reason}` : ''}`;
    
    const { data, error } = await supabase
        .from('notifications')
        .insert([{
            user_id: brokerId,
            title: 'Listing Status Update',
            message: msg,
            read: false
        }])
        .select()
        .single();

    if (error) console.error('Error sending broker notification:', error.message);
    return data;
}

export async function logListingStatusChange(listingId, changedByUserId, oldStatus, newStatus, reason) {
    const { data, error } = await supabase
        .from('listing_status_history')
        .insert([{
            listing_id: listingId,
            changed_by: changedByUserId,
            old_status: oldStatus,
            new_status: newStatus,
            reason: reason || 'No remarks provided.'
        }])
        .select()
        .single();

    if (error) console.error('Error logging status change:', error.message);
    return data;
}

export function subscribeToNotifications(userId, onNotificationChange) {
    if (!userId) return () => {};

    const channelName = `broker_notifications_${userId}`;
    const channel = supabase.channel(channelName)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            onNotificationChange(payload);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
