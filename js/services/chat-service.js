/**
 * Chat Service
 * Pure data operations for real-time chat between buyers and brokers.
 * Zero DOM dependencies; provides clean unsubscribe functions for React useEffect.
 */

import { supabase } from '../core/supabase-client.js';

export async function getBrokerConversations(brokerId) {
    if (!brokerId) return [];
    const { data: messages, error } = await supabase
        .from('messages')
        .select('buyer_id, listing_id, created_at')
        .eq('broker_id', brokerId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching broker conversations:', error);
        return [];
    }

    const uniqueMap = new Map();
    messages?.forEach(m => {
        const key = `${m.buyer_id}-${m.listing_id}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, m);
        }
    });

    return Array.from(uniqueMap.values());
}

export async function getMessages(buyerId, brokerId, listingId) {
    if (!buyerId || !brokerId || !listingId) return [];
    const { data: msgs, error } = await supabase
        .from('messages')
        .select('*')
        .eq('buyer_id', buyerId)
        .eq('broker_id', brokerId)
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error loading messages:', error);
        throw error;
    }
    return msgs || [];
}

export async function sendMessage({ buyerId, brokerId, listingId, senderId, content }) {
    const { data, error } = await supabase
        .from('messages')
        .insert([{
            buyer_id: buyerId,
            broker_id: brokerId,
            listing_id: listingId,
            sender_id: senderId,
            content: content
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export function subscribeToConversation(buyerId, brokerId, listingId, onMessageReceived) {
    const channelName = `chat_${buyerId}_${brokerId}_${listingId}`;
    const channel = supabase.channel(channelName)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `listing_id=eq.${listingId}`
        }, payload => {
            if (payload.new.buyer_id === buyerId && payload.new.broker_id === brokerId) {
                onMessageReceived(payload.new);
            }
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function subscribeToBrokerGlobalChat(brokerId, onIncomingMessage) {
    const channelName = `global_broker_chat_notification_${brokerId}`;
    const channel = supabase.channel(channelName)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `broker_id=eq.${brokerId}`
        }, payload => {
            onIncomingMessage(payload.new);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function formatMsgTime(dateStr) {
    if (!dateStr) return 'Just now';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Just now';
    
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 30000) return 'Just now';
    
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
    const dateOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
    
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], timeOptions);
    }
    
    return d.toLocaleDateString([], dateOptions);
}
