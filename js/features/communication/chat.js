/**
 * Chat Feature
 * Manages chat conversations, rendering messages, and sidebar badge updates.
 */

import { supabase } from '../../core/supabase-client.js';
import { escHtml } from '../../core/app-state.js';
import {
    getBrokerConversations,
    getMessages,
    sendMessage,
    subscribeToConversation,
    formatMsgTime
} from '../../services/chat-service.js';
import { showToast } from '../../ui/toast.js';

export const unreadConversations = new Set();
export const activeChatNames = {};
export let currentChatConversation = null;
let currentChatUnsubscribe = null;

export function updateSidebarMessagesBadge() {
    const badge = document.getElementById('unread-messages-badge');
    if (badge) {
        const count = unreadConversations.size;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
            badge.classList.add('inline-block');
        } else {
            badge.classList.add('hidden');
            badge.classList.remove('inline-block');
        }
    }
}

export async function initBrokerChat() {
    const listEl = document.getElementById('chat-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="p-4 text-center text-slate-500 font-medium">Loading conversations...</div>';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        const uniqueConversations = await getBrokerConversations(user.id);

        if (uniqueConversations.length === 0) {
            listEl.innerHTML = '<div class="p-4 text-center text-slate-500 font-medium">No conversations yet.</div>';
            return;
        }

        const buyerIds = [...new Set(uniqueConversations.map(c => c.buyer_id))];
        const listingIds = [...new Set(uniqueConversations.map(c => c.listing_id))];

        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', buyerIds);
        const { data: listings } = await supabase.from('listings').select('id, title').in('id', listingIds);

        profiles?.forEach(p => {
            activeChatNames[p.id] = p.full_name;
        });
        activeChatNames[user.id] = localStorage.getItem('userName') || 'You';

        listEl.innerHTML = '';
        uniqueConversations.forEach(c => {
            const buyer = profiles?.find(p => p.id === c.buyer_id);
            const listing = listings?.find(l => l.id === c.listing_id);
            const name = buyer?.full_name || 'Buyer';
            const letter = name.charAt(0).toUpperCase();

            const colors = [
                'bg-slate-900 text-white',
                'bg-indigo-900 text-indigo-100',
                'bg-blue-900 text-blue-100',
                'bg-emerald-900 text-emerald-100',
                'bg-teal-900 text-teal-100'
            ];
            const colorIdx = (name.charCodeAt(0) || 0) % colors.length;
            const colorClass = colors[colorIdx];

            const conversationKey = `${c.buyer_id}-${c.listing_id}`;
            const isUnread = unreadConversations.has(conversationKey);

            const div = document.createElement('div');
            div.className = `p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-all flex items-center gap-3 group relative ${isUnread ? 'bg-red-50/20' : ''}`;
            div.innerHTML = `
                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${colorClass} shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200">
                    ${letter}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <div class="font-bold text-slate-800 text-sm truncate group-hover:text-slate-900 transition-colors">${escHtml(name)}</div>
                        ${isUnread ? `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" title="Unread message"></span>` : ''}
                    </div>
                    <div class="text-xs text-slate-400 font-medium mt-0.5 truncate flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px] text-slate-300">domain</span>
                        ${escHtml(listing?.title || 'Property')}
                    </div>
                </div>
                <span class="material-symbols-outlined text-slate-300 text-[16px] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">chevron_right</span>
            `;
            div.onclick = () => {
                unreadConversations.delete(conversationKey);
                updateSidebarMessagesBadge();
                div.classList.remove('bg-red-50/20');
                const dot = div.querySelector('.bg-red-500');
                if (dot) dot.remove();
                loadChatMessages(c.buyer_id, user.id, c.listing_id, name, listing?.title || 'Property');
            };
            listEl.appendChild(div);
        });
    } catch (err) {
        listEl.innerHTML = `<div class="p-4 text-error">${err.message || 'Error loading conversations'}</div>`;
    }
}

export async function loadChatMessages(buyerId, brokerId, listingId, buyerName, listingTitle) {
    currentChatConversation = { buyerId, brokerId, listingId };
    activeChatNames[buyerId] = buyerName;
    activeChatNames[brokerId] = localStorage.getItem('userName') || 'You';

    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
        chatHeader.innerHTML = `
            <div>
                <a href="/profile.html?id=${buyerId}" target="_blank" class="text-lg font-bold text-slate-900 hover:text-slate-600 transition-colors flex items-center gap-1.5 hover:underline">
                    ${escHtml(buyerName)}
                    <span class="material-symbols-outlined text-[18px]">open_in_new</span>
                </a>
                <div class="text-xs font-medium text-slate-500">${escHtml(listingTitle)}</div>
            </div>
        `;
    }

    const msgsEl = document.getElementById('chat-messages');
    if (!msgsEl) return;

    if (!buyerId || !brokerId || !listingId) {
        msgsEl.innerHTML = '<div class="text-center text-error mt-4 font-medium">Invalid chat details (missing broker or buyer).</div>';
        return;
    }

    msgsEl.innerHTML = '<div class="text-center text-slate-500 mt-4 font-medium">Loading messages...</div>';

    const { data: { user } } = await supabase.auth.getUser();

    try {
        const msgs = await getMessages(buyerId, brokerId, listingId);
        msgsEl.innerHTML = '';
        if (msgs.length === 0) {
            msgsEl.innerHTML = '<div class="text-center text-slate-400 mt-10 font-medium">No messages yet. Say hi!</div>';
        } else {
            msgs.forEach(m => renderMessage(m, user.id, msgsEl));
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }
    } catch (error) {
        msgsEl.innerHTML = `<div class="text-error">Error: ${error.message}</div>`;
        return;
    }

    // Enable input
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (input && sendBtn) {
        input.disabled = false;
        sendBtn.disabled = false;

        sendBtn.onclick = async () => {
            const content = input.value.trim();
            if (!content) return;
            if (window.hasProfanity && window.hasProfanity(content)) {
                showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
                return;
            }
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;

            try {
                await sendMessage({
                    buyerId,
                    brokerId,
                    listingId,
                    senderId: user.id,
                    content
                });
            } catch (err) {
                showToast('Failed to send message: ' + err.message);
            }

            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        };

        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendBtn.click();
        };
    }

    // Clean up previous real-time subscription
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
        currentChatUnsubscribe = null;
    }

    currentChatUnsubscribe = subscribeToConversation(buyerId, brokerId, listingId, (newMsg) => {
        if (msgsEl.innerHTML.includes('No messages yet')) msgsEl.innerHTML = '';
        renderMessage(newMsg, user.id, msgsEl);
        msgsEl.scrollTop = msgsEl.scrollHeight;
    });
}

export function renderMessage(m, currentUserId, container) {
    const isMe = m.sender_id === currentUserId;
    const senderName = isMe ? 'You' : (activeChatNames[m.sender_id] || 'Buyer');
    const timeStr = formatMsgTime(m.created_at);

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `flex flex-col gap-1 w-full ${isMe ? 'items-end' : 'items-start'}`;

    const header = document.createElement('div');
    header.className = 'flex items-center gap-1.5 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest';

    let senderHTML = `<span>${escHtml(senderName)}</span>`;
    if (!isMe && m.sender_id) {
        senderHTML = `<a href="/profile.html?id=${m.sender_id}" target="_blank" class="hover:text-slate-800 hover:underline flex items-center gap-0.5 transition-colors">
            ${escHtml(senderName)}
            <span class="material-symbols-outlined text-[10px] inline-block font-normal">open_in_new</span>
        </a>`;
    }

    header.innerHTML = `${senderHTML}<span class="text-[8px] text-slate-300">•</span><span>${timeStr}</span>`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-[75%] px-4 py-3 rounded-2xl text-sm font-medium shadow-sm transition-all duration-200 hover:shadow-md ${
        isMe
            ? 'bg-slate-900 text-white rounded-tr-none border border-slate-800'
            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
    }`;
    bubble.textContent = m.content;

    msgWrapper.appendChild(header);
    msgWrapper.appendChild(bubble);
    container.appendChild(msgWrapper);
}

let buyerChatChannel = null;

export async function initBuyerChat(buyerId, brokerId, listingId, brokerName = 'Broker') {
    activeChatNames[buyerId] = localStorage.getItem('userName') || 'You';
    activeChatNames[brokerId] = brokerName;

    const msgsEl = document.getElementById('buyer-chat-messages');
    const input = document.getElementById('buyer-chat-input');
    const sendBtn = document.getElementById('buyer-chat-send');

    if (!msgsEl || !input || !sendBtn) return;

    if (!buyerId || !brokerId || !listingId) {
        msgsEl.innerHTML = '<div class="text-center text-slate-400 font-medium my-auto absolute inset-0 flex items-center justify-center">Chat is unavailable for this listing (missing broker/buyer details).</div>';
        input.disabled = true;
        sendBtn.disabled = true;
        return;
    }

    msgsEl.innerHTML = '<div class="text-center text-slate-500 my-auto">Loading...</div>';

    const fetchMsgs = async () => {
        try {
            const msgs = await getMessages(buyerId, brokerId, listingId);
            msgsEl.innerHTML = '';
            if (msgs.length === 0) {
                msgsEl.innerHTML = '<div class="text-center text-slate-400 font-medium my-auto absolute inset-0 flex items-center justify-center">Start a conversation!</div>';
            } else {
                msgs.forEach(m => renderMessage(m, buyerId, msgsEl));
                msgsEl.scrollTop = msgsEl.scrollHeight;
            }
        } catch (error) {
            msgsEl.innerHTML = `<div class="text-error">${error.message}</div>`;
        }
    };

    await fetchMsgs();

    sendBtn.onclick = async () => {
        const content = input.value.trim();
        if (!content) return;
        if (window.hasProfanity && window.hasProfanity(content)) {
            showToast('WARNING: Swearing is strictly prohibited! Please remove all offensive language to proceed.', 'profanity');
            return;
        }
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        try {
            await sendMessage({
                buyerId,
                brokerId,
                listingId,
                senderId: buyerId,
                content
            });
        } catch (error) {
            showToast('Failed to send message: ' + error.message);
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    };

    input.onkeypress = (e) => {
        if (e.key === 'Enter') sendBtn.click();
    };

    if (buyerChatChannel) supabase.removeChannel(buyerChatChannel);
    buyerChatChannel = supabase.channel(`buyer_chat_${buyerId}_${brokerId}_${listingId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `listing_id=eq.${listingId}` 
        }, payload => {
            if (payload.new.buyer_id === buyerId && payload.new.broker_id === brokerId) {
                if (msgsEl.innerHTML.includes('Start a conversation!')) msgsEl.innerHTML = '';
                renderMessage(payload.new, buyerId, msgsEl);
                msgsEl.scrollTop = msgsEl.scrollHeight;
            }
        })
        .subscribe();
}

// Preserve global window bindings
window.initBrokerChat = initBrokerChat;
window.initBuyerChat = initBuyerChat;
window.loadChatMessages = loadChatMessages;
window.renderMessage = renderMessage;
