/**
 * Deal Service
 * Pure data & business operations for:
 * 1. Deal Completion / Mark Deal Done — three-party confirmation system
 *    (Broker + Buyer/Tenant + Seller/Owner must all acknowledge completion)
 * 2. Rental Agreement data — assembled from completed transaction + participants
 * 3. Maintenance Requests — CRUD for post-deal maintenance tickets
 * Zero DOM dependencies; fully reusable across Vanilla JS and React.
 */

import { supabase } from '../core/supabase-client.js';

// ─── LocalStorage fallback keys ───────────────────────────────────────────────
export const STORAGE_DEALS_KEY      = 'projectx_transactions';   // shared with rating-service
export const STORAGE_MAINT_KEY      = 'projectx_maintenance_requests';
export const STORAGE_ACK_KEY_PREFIX = 'projectx_deal_ack_';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLocalData(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function saveLocalData(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {
        console.warn(`Failed to save ${key}:`, e);
    }
}

// ─── 1. DEAL SEEDING & RESILIENCE ─────────────────────────────────────────────

export function seedDealsIfEmpty(activeUserId = null, activeRole = null) {
    const existing = getLocalData(STORAGE_DEALS_KEY);
    
    // Normalize user role
    const normalizedRole = (activeRole || '').toLowerCase();
    const isBroker = normalizedRole === 'broker';
    const isBuyer  = normalizedRole === 'buyer';
    const isSeller = normalizedRole === 'seller';

    // If transactions already exist, check if current user is wired into them
    if (existing.length > 0) {
        if (activeUserId) {
            let modified = false;
            existing.forEach(tx => {
                if (isBroker && tx.broker_id !== activeUserId && !tx.broker_id) {
                    tx.broker_id = activeUserId;
                    modified = true;
                }
                if (isBuyer && tx.buyer_id !== activeUserId && !tx.buyer_id) {
                    tx.buyer_id = activeUserId;
                    modified = true;
                }
                if (isSeller && tx.seller_id !== activeUserId && !tx.seller_id) {
                    tx.seller_id = activeUserId;
                    modified = true;
                }
            });
            if (modified) saveLocalData(STORAGE_DEALS_KEY, existing);
        }
        return existing;
    }

    const defaultBrokerId = 'b40658a9-f534-4f58-bd26-6e5943b41b7f';
    const defaultBuyerId  = 'b260e9ea-1e9d-4938-b2c9-a25809cbdd56';
    const defaultSellerId = 'e1234567-89ab-cdef-0123-456789abcdef';

    const currentUserName = localStorage.getItem('userName') || 'Current User';

    const sampleDeals = [
        {
            id: 'tx-mumbai-101',
            listing_id: 210,
            property_title: '1BHK Apartment in Udyog Vihar',
            property_location: 'Udyog Vihar, Mumbai',
            property_img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80',
            broker_id: isBroker && activeUserId ? activeUserId : defaultBrokerId,
            broker_name: isBroker && activeUserId ? currentUserName : 'Akshay Ahuja',
            broker_phone: '+91 98201 12345',
            buyer_id: isBuyer && activeUserId ? activeUserId : defaultBuyerId,
            buyer_name: isBuyer && activeUserId ? currentUserName : 'Manav',
            buyer_phone: '+91 98765 43210',
            seller_id: isSeller && activeUserId ? activeUserId : defaultSellerId,
            seller_name: isSeller && activeUserId ? currentUserName : 'Rahul Sharma',
            seller_phone: '+91 99887 76655',
            transaction_type: 'Rental',
            amount: 142080,
            status: 'completed',
            closed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
            created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
            updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
            deal_acknowledgements: { broker: true, buyer: true, seller: true }
        },
        {
            id: 'tx-mumbai-102',
            listing_id: 211,
            property_title: '2BHK Luxury Apartment in Medavakkam',
            property_location: 'Medavakkam, Mumbai',
            property_img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80',
            broker_id: isBroker && activeUserId ? activeUserId : defaultBrokerId,
            broker_name: isBroker && activeUserId ? currentUserName : 'Akshay Ahuja',
            broker_phone: '+91 98201 12345',
            buyer_id: 'f9774926-4ba6-4a23-be64-cebfd643ecca',
            buyer_name: 'Priya Sharma',
            buyer_phone: '+91 91234 56789',
            seller_id: isSeller && activeUserId ? activeUserId : defaultSellerId,
            seller_name: isSeller && activeUserId ? currentUserName : 'Rahul Sharma',
            seller_phone: '+91 99887 76655',
            transaction_type: 'Sale',
            amount: 8500000,
            status: 'completed',
            closed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
            created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
            updated_at: new Date(Date.now() - 7 * 86400000).toISOString(),
            deal_acknowledgements: { broker: true, buyer: true, seller: true }
        },
        {
            id: 'tx-mumbai-103',
            listing_id: 236,
            property_title: '1 BHK Furnished Apartment in Hinjawadi',
            property_location: 'Hinjawadi, Pune',
            property_img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80',
            broker_id: isBroker && activeUserId ? activeUserId : defaultBrokerId,
            broker_name: isBroker && activeUserId ? currentUserName : 'Akshay Ahuja',
            broker_phone: '+91 98201 12345',
            buyer_id: isBuyer && activeUserId ? activeUserId : defaultBuyerId,
            buyer_name: isBuyer && activeUserId ? currentUserName : 'Manav',
            buyer_phone: '+91 98765 43210',
            seller_id: isSeller && activeUserId ? activeUserId : defaultSellerId,
            seller_name: isSeller && activeUserId ? currentUserName : 'Rahul Sharma',
            seller_phone: '+91 99887 76655',
            transaction_type: 'Rental',
            amount: 22000,
            status: 'pending', // Eligible for "Mark Deal Done" testing
            closed_at: null,
            created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            deal_acknowledgements: { broker: false, buyer: false, seller: false }
        }
    ];

    saveLocalData(STORAGE_DEALS_KEY, sampleDeals);
    return sampleDeals;
}

// ─── 2. DEAL COMPLETION & ACKNOWLEDGEMENT ─────────────────────────────────────

/**
 * Returns the acknowledgement status map for a transaction
 */
export function getDealAckState(transactionId) {
    const raw = localStorage.getItem(STORAGE_ACK_KEY_PREFIX + transactionId);
    if (raw) {
        try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    const local = getLocalData(STORAGE_DEALS_KEY);
    const tx = local.find(t => String(t.id) === String(transactionId));
    if (tx && tx.deal_acknowledgements) {
        return tx.deal_acknowledgements;
    }
    return { broker: false, buyer: false, seller: false };
}

export function saveDealAckState(transactionId, state) {
    localStorage.setItem(STORAGE_ACK_KEY_PREFIX + transactionId, JSON.stringify(state));
}

/**
 * Validates whether a user is an authorized participant in a deal.
 * Returns the matched participant role ('broker' | 'buyer' | 'seller') or null.
 */
export function getParticipantRole(tx, userId) {
    if (!tx || !userId) return null;
    const uid = String(userId);
    if (tx.broker_id && String(tx.broker_id) === uid) return 'broker';
    if (tx.buyer_id  && String(tx.buyer_id)  === uid) return 'buyer';
    if (tx.seller_id && String(tx.seller_id) === uid) return 'seller';
    return null;
}

/**
 * Records a participant's "Mark Deal Done" action.
 * Enforces strict authorization: user must be broker, buyer, or seller in this transaction.
 * Supports multi-party confirmation or immediate completion.
 *
 * @param {string} transactionId
 * @param {string} userId
 * @param {Object} [options] - { forceComplete: boolean, role: string }
 * @returns {Promise<{ tx: Object, ackState: Object, allAcknowledged: boolean }>}
 */
export async function acknowledgeDealDone(transactionId, userId, options = {}) {
    if (!transactionId || !userId) {
        throw new Error('Transaction ID and User ID are required.');
    }

    const tx = await getDealById(transactionId);
    if (!tx) throw new Error('Transaction not found.');

    if (tx.status === 'completed') {
        return {
            tx,
            ackState: { broker: true, buyer: true, seller: true },
            allAcknowledged: true
        };
    }

    // Authorization check
    let participantRole = options.role ? options.role.toLowerCase() : getParticipantRole(tx, userId);
    if (!participantRole || !['broker', 'buyer', 'seller'].includes(participantRole)) {
        participantRole = getParticipantRole(tx, userId);
    }

    if (!participantRole) {
        throw new Error('Unauthorized: You are not a registered participant in this deal.');
    }

    // Verify user ID matches participant slot
    const slotMap = {
        broker: tx.broker_id,
        buyer:  tx.buyer_id,
        seller: tx.seller_id
    };
    if (String(slotMap[participantRole]) !== String(userId)) {
        throw new Error(`Unauthorized: You are not authorized to mark this deal done as ${participantRole}.`);
    }

    // Update acknowledgement state
    const ackState = { ...getDealAckState(transactionId) };
    ackState[participantRole] = true;
    saveDealAckState(transactionId, ackState);

    // Check if all participating parties confirmed or if force complete requested
    const allAcknowledged = options.forceComplete || checkAllAcknowledged(tx, ackState);

    let updatedTx = tx;
    if (allAcknowledged) {
        updatedTx = await markTransactionCompleted(transactionId);
    } else {
        // Persist partial ack to Supabase & local
        try {
            await supabase
                .from('transactions')
                .update({ deal_acknowledgements: ackState, updated_at: new Date().toISOString() })
                .eq('id', transactionId);
        } catch { /* fall back */ }

        const local = getLocalData(STORAGE_DEALS_KEY);
        const idx = local.findIndex(t => String(t.id) === String(transactionId));
        if (idx !== -1) {
            local[idx].deal_acknowledgements = ackState;
            local[idx].updated_at = new Date().toISOString();
            saveLocalData(STORAGE_DEALS_KEY, local);
            updatedTx = local[idx];
        }
    }

    return { tx: updatedTx, ackState, allAcknowledged };
}

/**
 * Returns true when all defined parties of a transaction have acknowledged.
 */
export function checkAllAcknowledged(tx, ackState) {
    if (!tx || !ackState) return false;
    const needsBroker = !!tx.broker_id;
    const needsBuyer  = !!tx.buyer_id;
    const needsSeller = !!tx.seller_id && String(tx.seller_id) !== String(tx.buyer_id);

    if (needsBroker && !ackState.broker) return false;
    if (needsBuyer  && !ackState.buyer)  return false;
    if (needsSeller && !ackState.seller) return false;
    return true;
}

/**
 * Marks a transaction as completed with closed_at timestamp.
 */
export async function markTransactionCompleted(transactionId) {
    const now = new Date().toISOString();
    const ackState = { broker: true, buyer: true, seller: true };
    saveDealAckState(transactionId, ackState);

    try {
        const { data, error } = await supabase
            .from('transactions')
            .update({
                status: 'completed',
                closed_at: now,
                updated_at: now,
                deal_acknowledgements: ackState
            })
            .eq('id', transactionId)
            .select()
            .single();

        if (!error && data) {
            const local = getLocalData(STORAGE_DEALS_KEY);
            const idx = local.findIndex(t => String(t.id) === String(transactionId));
            if (idx !== -1) {
                local[idx] = { ...local[idx], status: 'completed', closed_at: now, updated_at: now, deal_acknowledgements: ackState };
                saveLocalData(STORAGE_DEALS_KEY, local);
            }
            window.dispatchEvent(new CustomEvent('dealCompleted', { detail: data }));
            return data;
        }
    } catch { /* fall back */ }

    // Local fallback
    const local = getLocalData(STORAGE_DEALS_KEY);
    const tx = local.find(t => String(t.id) === String(transactionId));
    if (!tx) throw new Error('Transaction not found.');
    tx.status = 'completed';
    tx.closed_at = now;
    tx.updated_at = now;
    tx.deal_acknowledgements = ackState;
    saveLocalData(STORAGE_DEALS_KEY, local);

    window.dispatchEvent(new CustomEvent('dealCompleted', { detail: tx }));
    return tx;
}

// ─── 3. DEAL & PROPERTY QUERIES ───────────────────────────────────────────────

/**
 * Fetches a single transaction with full participant profiles.
 */
export async function getDealById(transactionId) {
    if (!transactionId) return null;

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                listing:listings(id, title, location, price, intent, type, img, address),
                broker:profiles!transactions_broker_id_fkey(id, full_name, role, avatar_url, phone, email),
                buyer:profiles!transactions_buyer_id_fkey(id, full_name, role, avatar_url, phone, email),
                seller:profiles!transactions_seller_id_fkey(id, full_name, role, avatar_url, phone, email)
            `)
            .eq('id', transactionId)
            .maybeSingle();

        if (!error && data) return data;
    } catch { /* fall back */ }

    const local = getLocalData(STORAGE_DEALS_KEY);
    return local.find(t => String(t.id) === String(transactionId)) || null;
}

/**
 * Fetches deals for a user (as broker, buyer/tenant, or seller).
 */
export async function getDealsForUser(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                listing:listings(id, title, location, price, intent, type, img),
                broker:profiles!transactions_broker_id_fkey(id, full_name, role, avatar_url, phone),
                buyer:profiles!transactions_buyer_id_fkey(id, full_name, role, avatar_url, phone),
                seller:profiles!transactions_seller_id_fkey(id, full_name, role, avatar_url, phone)
            `)
            .or(`broker_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) return data;
    } catch { /* fall back */ }

    const local = getLocalData(STORAGE_DEALS_KEY);
    const uid = String(userId);
    return local.filter(t => 
        String(t.broker_id) === uid || 
        String(t.buyer_id)  === uid || 
        String(t.seller_id) === uid
    );
}

/**
 * Fetches completed properties for an Owner or Tenant.
 * Dedupes by listing_id so the same property does not appear multiple times.
 */
export async function getCompletedPropertiesForUser(userId) {
    const deals = await getDealsForUser(userId);
    const completed = deals.filter(d => d.status === 'completed');

    // Dedupe by listing_id
    const seen = new Set();
    const unique = [];
    completed.forEach(deal => {
        const key = deal.listing_id || deal.id;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(deal);
        }
    });
    return unique;
}

// ─── 4. RENTAL AGREEMENT DATA ─────────────────────────────────────────────────

export async function getRentalAgreementData(transactionId) {
    const tx = await getDealById(transactionId);
    if (!tx) return null;
    if (tx.status !== 'completed') return null;

    const listing = tx.listing || {};
    const broker  = tx.broker  || {};
    const tenant  = tx.buyer   || {};
    const owner   = tx.seller  || {};

    const startDate = tx.closed_at ? new Date(tx.closed_at) : new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 11);

    return {
        agreementId:        `AGR-${String(tx.id).slice(-10).toUpperCase()}`,
        transactionId:      tx.id,
        status:             tx.status,
        transactionType:    tx.transaction_type || 'Rental',
        closedAt:           tx.closed_at,
        createdAt:          tx.created_at,

        // Property Details
        propertyTitle:      listing.title    || tx.property_title    || 'Residential Property',
        propertyAddress:    listing.address  || listing.location     || tx.property_location || 'Prime Metro Location',
        propertyType:       listing.type     || 'Apartment',
        propertyIntent:     listing.intent   || tx.transaction_type  || 'Rental',
        propertyImg:        listing.img      || tx.property_img      || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80',
        listingId:          tx.listing_id,

        // Financial Terms
        monthlyRent:        tx.amount        || 0,
        securityDeposit:    (tx.amount || 0) * 2,
        currency:           'INR',

        // Term Dates
        agreementStartDate: startDate.toISOString(),
        agreementEndDate:   endDate.toISOString(),
        durationMonths:     11,

        // Participating Parties
        broker: {
            id:     broker.id    || tx.broker_id,
            name:   broker.full_name || tx.broker_name || 'ProjectX Verified Broker',
            role:   'Licensed Broker',
            phone:  broker.phone || tx.broker_phone || '—',
            email:  broker.email || 'broker@projectx.in',
            avatar: broker.avatar_url || null
        },
        tenant: {
            id:     tenant.id    || tx.buyer_id,
            name:   tenant.full_name || tx.buyer_name  || 'Verified Tenant',
            role:   'Tenant / Occupant',
            phone:  tenant.phone || tx.buyer_phone || '—',
            email:  tenant.email || 'tenant@projectx.in',
            avatar: tenant.avatar_url || null
        },
        owner: {
            id:     owner.id     || tx.seller_id,
            name:   owner.full_name  || tx.seller_name || 'Property Owner / Landlord',
            role:   'Property Owner / Landlord',
            phone:  owner.phone  || tx.seller_phone || '—',
            email:  owner.email  || 'owner@projectx.in',
            avatar: owner.avatar_url || null
        }
    };
}

// ─── 5. MAINTENANCE REQUESTS ──────────────────────────────────────────────────

export async function getMaintenanceRequests(transactionId) {
    if (!transactionId) return [];

    try {
        const { data, error } = await supabase
            .from('maintenance_requests')
            .select(`
                *,
                requester:profiles!maintenance_requests_requester_id_fkey(id, full_name, role, avatar_url)
            `)
            .eq('transaction_id', transactionId)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) return data;
    } catch { /* fall back */ }

    const local = getLocalData(STORAGE_MAINT_KEY);
    return local.filter(r => String(r.transaction_id) === String(transactionId));
}

export async function createMaintenanceRequest(requestData) {
    const {
        transactionId,
        requesterId,
        title,
        description,
        category = 'General',
        priority = 'Medium'
    } = requestData;

    if (!transactionId || !requesterId || !title) {
        throw new Error('Transaction ID, requester ID, and title are required.');
    }

    const tx = await getDealById(transactionId);
    if (!tx) throw new Error('Transaction not found.');
    if (tx.status !== 'completed') {
        throw new Error('Maintenance requests can only be raised after deal completion.');
    }

    const isParticipant = (
        String(tx.broker_id) === String(requesterId) ||
        String(tx.buyer_id)  === String(requesterId) ||
        String(tx.seller_id) === String(requesterId)
    );
    if (!isParticipant) {
        throw new Error('Unauthorized: Only verified deal participants may raise maintenance requests.');
    }

    const requesterName = localStorage.getItem('userName') || 'Participant';
    const requesterRole = localStorage.getItem('role') || 'Tenant';

    const payload = {
        id:             crypto.randomUUID(),
        transaction_id: transactionId,
        listing_id:     tx.listing_id || null,
        requester_id:   requesterId,
        requester_name: requesterName,
        requester_role: requesterRole,
        title:          title.trim().slice(0, 120),
        description:    (description || '').trim().slice(0, 1000),
        category,
        priority,
        status:         'open',
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString()
    };

    try {
        const { data, error } = await supabase
            .from('maintenance_requests')
            .insert([payload])
            .select()
            .single();

        if (!error && data) {
            const local = getLocalData(STORAGE_MAINT_KEY);
            local.unshift(data);
            saveLocalData(STORAGE_MAINT_KEY, local);
            return data;
        }
    } catch { /* fall back */ }

    const local = getLocalData(STORAGE_MAINT_KEY);
    local.unshift(payload);
    saveLocalData(STORAGE_MAINT_KEY, local);
    return payload;
}

export async function updateMaintenanceStatus(requestId, newStatus) {
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
    }

    const now = new Date().toISOString();

    try {
        const { data, error } = await supabase
            .from('maintenance_requests')
            .update({ status: newStatus, updated_at: now })
            .eq('id', requestId)
            .select()
            .single();

        if (!error && data) {
            const local = getLocalData(STORAGE_MAINT_KEY);
            const idx = local.findIndex(r => String(r.id) === String(requestId));
            if (idx !== -1) {
                local[idx] = { ...local[idx], status: newStatus, updated_at: now };
                saveLocalData(STORAGE_MAINT_KEY, local);
            }
            return data;
        }
    } catch { /* fall back */ }

    const local = getLocalData(STORAGE_MAINT_KEY);
    const req = local.find(r => String(r.id) === String(requestId));
    if (!req) throw new Error('Maintenance request not found.');
    req.status = newStatus;
    req.updated_at = now;
    saveLocalData(STORAGE_MAINT_KEY, local);
    return req;
}
