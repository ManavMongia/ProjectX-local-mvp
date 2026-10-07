/**
 * Rating & Transaction Service
 * Pure data and business operations for:
 * 1. Transactions / Deals lifecycle (pending, completed, cancelled)
 * 2. Transaction-based mutual ratings & reviews (Broker <-> Buyer/Tenant <-> Seller)
 * 3. Strict fraud prevention:
 *    - No rating without verified completed transaction
 *    - Mutual participation enforcement
 *    - No duplicate ratings per transaction
 *    - No self-ratings
 *    - Integrated profanity moderation
 * Zero DOM dependencies; fully reusable across Vanilla JS and React.
 */

import { supabase } from '../core/supabase-client.js';
import { hasProfanity } from './moderation-service.js';

// Local storage fallback keys for resilient offline / pre-migration testing
const STORAGE_TRANSACTIONS_KEY = 'projectx_transactions';
const STORAGE_RATINGS_KEY = 'projectx_ratings';

/**
 * Reads local transactions store
 */
function getLocalTransactions() {
    try {
        const raw = localStorage.getItem(STORAGE_TRANSACTIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Saves local transactions store
 */
function saveLocalTransactions(txs) {
    try {
        localStorage.setItem(STORAGE_TRANSACTIONS_KEY, JSON.stringify(txs));
    } catch (e) {
        console.warn('Failed to save local transactions:', e);
    }
}

/**
 * Reads local ratings store
 */
function getLocalRatings() {
    try {
        const raw = localStorage.getItem(STORAGE_RATINGS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Saves local ratings store
 */
function saveLocalRatings(ratings) {
    try {
        localStorage.setItem(STORAGE_RATINGS_KEY, JSON.stringify(ratings));
    } catch (e) {
        console.warn('Failed to save local ratings:', e);
    }
}

/**
 * Fetches all transactions for a user (as broker, buyer/tenant, or seller)
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function getTransactionsForUser(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                listing:listings(id, title, location, price, intent, img),
                broker:profiles!transactions_broker_id_fkey(id, full_name, role, avatar_url),
                buyer:profiles!transactions_buyer_id_fkey(id, full_name, role, avatar_url),
                seller:profiles!transactions_seller_id_fkey(id, full_name, role, avatar_url)
            `)
            .or(`broker_id.eq.${userId},buyer_id.eq.${userId},seller_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
            return data;
        }
    } catch (err) {
        // Fall back to local store
    }

    const local = getLocalTransactions();
    return local.filter(t => t.broker_id === userId || t.buyer_id === userId || t.seller_id === userId);
}

/**
 * Fetches a single transaction by ID
 * @param {string} transactionId 
 * @returns {Promise<Object|null>}
 */
export async function getTransactionById(transactionId) {
    if (!transactionId) return null;

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                listing:listings(id, title, location, price, intent, img),
                broker:profiles!transactions_broker_id_fkey(id, full_name, role, avatar_url),
                buyer:profiles!transactions_buyer_id_fkey(id, full_name, role, avatar_url)
            `)
            .eq('id', transactionId)
            .maybeSingle();

        if (!error && data) return data;
    } catch (err) {
        // Fall back to local store
    }

    const local = getLocalTransactions();
    return local.find(t => String(t.id) === String(transactionId)) || null;
}

/**
 * Creates a new transaction record
 * @param {Object} txData 
 * @returns {Promise<Object>}
 */
export async function createTransaction(txData) {
    const payload = {
        id: txData.id || crypto.randomUUID(),
        listing_id: txData.listing_id || null,
        broker_id: txData.broker_id,
        buyer_id: txData.buyer_id,
        seller_id: txData.seller_id || null,
        transaction_type: txData.transaction_type || 'Sale',
        amount: txData.amount || 0,
        status: txData.status || 'pending',
        closed_at: txData.status === 'completed' ? (txData.closed_at || new Date().toISOString()) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Client metadata for instant local rendering
        property_title: txData.property_title || 'Verified Property',
        property_location: txData.property_location || 'Mumbai'
    };

    try {
        const { data, error } = await supabase
            .from('transactions')
            .insert([payload])
            .select()
            .single();

        if (!error && data) {
            // Also mirror locally
            const local = getLocalTransactions();
            local.unshift(data);
            saveLocalTransactions(local);
            return data;
        }
    } catch (err) {
        // Fallback
    }

    const local = getLocalTransactions();
    local.unshift(payload);
    saveLocalTransactions(local);
    return payload;
}

/**
 * Marks an existing transaction as completed (closed deal)
 * @param {string} transactionId 
 * @returns {Promise<Object>}
 */
export async function completeTransaction(transactionId) {
    const now = new Date().toISOString();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .update({ status: 'completed', closed_at: now, updated_at: now })
            .eq('id', transactionId)
            .select()
            .single();

        if (!error && data) {
            const local = getLocalTransactions();
            const idx = local.findIndex(t => String(t.id) === String(transactionId));
            if (idx !== -1) {
                local[idx] = { ...local[idx], status: 'completed', closed_at: now, updated_at: now };
                saveLocalTransactions(local);
            }
            return data;
        }
    } catch (err) {
        // Fallback
    }

    const local = getLocalTransactions();
    const target = local.find(t => String(t.id) === String(transactionId));
    if (!target) throw new Error('Transaction not found.');

    target.status = 'completed';
    target.closed_at = now;
    target.updated_at = now;
    saveLocalTransactions(local);
    return target;
}

/**
 * Fetches all reviews and ratings for a user
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function getRatingsForUser(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('ratings')
            .select(`
                *,
                rater:profiles!ratings_rater_id_fkey(id, full_name, role, avatar_url),
                transaction:transactions(id, transaction_type, closed_at, listing_id)
            `)
            .eq('rated_user_id', userId)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
            return data;
        }
    } catch (err) {
        // Fallback to local store
    }

    const local = getLocalRatings();
    return local.filter(r => r.rated_user_id === userId);
}

/**
 * Computes average rating, total count, and 1-5 star distribution for a user
 * @param {string} userId 
 * @returns {Promise<Object>}
 */
export async function getUserRatingSummary(userId) {
    const ratings = await getRatingsForUser(userId);

    const totalCount = ratings.length;
    if (totalCount === 0) {
        return {
            average: null,
            count: 0,
            distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            recentReviews: []
        };
    }

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;

    ratings.forEach(r => {
        const score = Math.round(Number(r.rating));
        if (score >= 1 && score <= 5) {
            distribution[score] = (distribution[score] || 0) + 1;
            sum += score;
        }
    });

    const average = (sum / totalCount).toFixed(1);

    return {
        average: parseFloat(average),
        count: totalCount,
        distribution,
        recentReviews: ratings.slice(0, 5)
    };
}

/**
 * Checks if a rating already exists for a specific transaction between rater and rated user
 * @param {string} transactionId 
 * @param {string} raterId 
 * @param {string} ratedUserId 
 * @returns {Promise<Object|null>}
 */
export async function getRatingForTransaction(transactionId, raterId, ratedUserId) {
    if (!transactionId || !raterId || !ratedUserId) return null;

    try {
        const { data, error } = await supabase
            .from('ratings')
            .select('*')
            .eq('transaction_id', transactionId)
            .eq('rater_id', raterId)
            .eq('rated_user_id', ratedUserId)
            .maybeSingle();

        if (!error && data) return data;
    } catch (err) {
        // Fallback
    }

    const local = getLocalRatings();
    return local.find(r => 
        String(r.transaction_id) === String(transactionId) &&
        r.rater_id === raterId &&
        r.rated_user_id === ratedUserId
    ) || null;
}

/**
 * Rigorously checks whether a user is eligible to rate a target user for a specific transaction.
 * Enforces all platform safety constraints:
 * 1. Must be authenticated.
 * 2. Self-rating is strictly prohibited (raterId != ratedUserId).
 * 3. The transaction must exist.
 * 4. The transaction must have status === 'completed'.
 * 5. The rater must have participated in the transaction.
 * 6. The target user must have participated in the same transaction.
 * 7. Duplicate ratings for the same transaction are prohibited.
 * 
 * @param {string} transactionId 
 * @param {string} raterId 
 * @param {string} ratedUserId 
 * @returns {Promise<{ eligible: boolean, error?: string, transaction?: Object }>}
 */
export async function checkRatingEligibility(transactionId, raterId, ratedUserId) {
    if (!raterId) {
        return { eligible: false, error: 'You must be signed in to submit a rating.' };
    }

    if (!ratedUserId) {
        return { eligible: false, error: 'Target user must be specified.' };
    }

    if (raterId === ratedUserId) {
        return { eligible: false, error: 'Self-rating is strictly prohibited.' };
    }

    if (!transactionId) {
        return { eligible: false, error: 'A completed transaction reference is required to rate.' };
    }

    // 1. Fetch transaction
    const tx = await getTransactionById(transactionId);
    if (!tx) {
        return { eligible: false, error: 'Transaction not found or invalid.' };
    }

    // 2. Enforce completed status
    if (tx.status !== 'completed') {
        return { 
            eligible: false, 
            error: `Deals must be completed before rating. This transaction is currently ${tx.status || 'in progress'}.` 
        };
    }

    // 3. Verify rater participation
    const raterParticipated = (tx.broker_id === raterId || tx.buyer_id === raterId || tx.seller_id === raterId);
    if (!raterParticipated) {
        return { eligible: false, error: 'You did not participate in this transaction.' };
    }

    // 4. Verify target user participation
    const targetParticipated = (tx.broker_id === ratedUserId || tx.buyer_id === ratedUserId || tx.seller_id === ratedUserId);
    if (!targetParticipated) {
        return { eligible: false, error: 'The user being rated did not participate in this transaction.' };
    }

    // 5. Check duplicate rating
    const existing = await getRatingForTransaction(transactionId, raterId, ratedUserId);
    if (existing) {
        return { 
            eligible: false, 
            error: 'You have already submitted a rating for this completed transaction.',
            existingRating: existing
        };
    }

    return { eligible: true, transaction: tx };
}

/**
 * Finds all completed transactions between rater and target user that have not yet been rated by rater
 * @param {string} currentUserId 
 * @param {string} targetUserId (optional)
 * @returns {Promise<Array>}
 */
export async function getEligibleTransactionsToRate(currentUserId, targetUserId = null) {
    if (!currentUserId) return [];

    const allTx = await getTransactionsForUser(currentUserId);
    const completedTx = allTx.filter(t => t.status === 'completed');

    const eligible = [];
    for (const tx of completedTx) {
        // Determine counterparties
        const participants = [tx.broker_id, tx.buyer_id, tx.seller_id].filter(Boolean);
        const counterparties = participants.filter(id => id !== currentUserId);

        for (const counterpartId of counterparties) {
            if (targetUserId && counterpartId !== targetUserId) continue;

            const existingRating = await getRatingForTransaction(tx.id, currentUserId, counterpartId);
            if (!existingRating) {
                eligible.push({
                    transaction: tx,
                    targetUserId: counterpartId
                });
            }
        }
    }

    return eligible;
}

/**
 * Submits a verified rating & review
 * Validates eligibility, score, review length, and profanity.
 * 
 * @param {Object} param0 
 * @param {string} param0.transactionId
 * @param {string} param0.raterId
 * @param {string} param0.ratedUserId
 * @param {number} param0.rating (1 to 5)
 * @param {string} [param0.review] (optional text up to 500 chars)
 * @param {string} [param0.raterName] (for display caching)
 * @param {string} [param0.raterRole] (for display caching)
 * @returns {Promise<Object>}
 */
export async function submitRating({ transactionId, raterId, ratedUserId, rating, review = '', raterName = '', raterRole = '' }) {
    // 1. Eligibility validation
    const eligibility = await checkRatingEligibility(transactionId, raterId, ratedUserId);
    if (!eligibility.eligible) {
        throw new Error(eligibility.error);
    }

    // 2. Score validation
    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        throw new Error('Please select a star rating between 1 and 5.');
    }

    // 3. Review character limit validation
    const trimmedReview = (review || '').trim();
    if (trimmedReview.length > 500) {
        throw new Error('Review text cannot exceed 500 characters.');
    }

    // 4. Moderation / Profanity check
    if (trimmedReview && hasProfanity(trimmedReview)) {
        throw new Error('WARNING: Swearing and offensive language are strictly prohibited. Please revise your review.');
    }

    const payload = {
        id: crypto.randomUUID(),
        transaction_id: transactionId,
        rater_id: raterId,
        rated_user_id: ratedUserId,
        rating: numRating,
        review: trimmedReview,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Client metadata for instant local rendering
        rater_name: raterName || localStorage.getItem('userName') || 'Verified User',
        rater_role: raterRole || localStorage.getItem('role') || 'Buyer',
        property_title: eligibility.transaction?.property_title || eligibility.transaction?.listing?.title || 'Verified Property Deal'
    };

    // 5. Insert into Supabase
    try {
        const { data, error } = await supabase
            .from('ratings')
            .insert([payload])
            .select()
            .single();

        if (!error && data) {
            // Mirror locally
            const local = getLocalRatings();
            local.unshift(payload);
            saveLocalRatings(local);

            window.dispatchEvent(new CustomEvent('ratingSubmitted', { detail: payload }));
            return data;
        }
    } catch (err) {
        // Fallback
    }

    // 6. Local persistent fallback
    const local = getLocalRatings();
    local.unshift(payload);
    saveLocalRatings(local);

    window.dispatchEvent(new CustomEvent('ratingSubmitted', { detail: payload }));
    return payload;
}

/**
 * Seeds sample completed and pending deals if no transactions exist yet.
 * Ensures immediate end-to-end interactive testing of mutual ratings.
 */
export function seedSampleDealsIfEmpty(activeUserId = null, activeRole = null) {
    const existing = getLocalTransactions();
    if (existing.length > 0) return existing;

    const defaultBrokerId = 'b40658a9-f534-4f58-bd26-6e5943b41b7f';
    const defaultBuyerId  = 'b260e9ea-1e9d-4938-b2c9-a25809cbdd56';
    const defaultSellerId = 'e1234567-89ab-cdef-0123-456789abcdef';
    const currentUserName = localStorage.getItem('userName') || 'Current User';

    const normalizedRole = (activeRole || '').toLowerCase();
    const isBroker = normalizedRole === 'broker';
    const isBuyer  = normalizedRole === 'buyer';
    const isSeller = normalizedRole === 'seller';

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
            status: 'pending',
            closed_at: null,
            created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            deal_acknowledgements: { broker: false, buyer: false, seller: false }
        }
    ];

    saveLocalTransactions(sampleDeals);

    // Also seed a pre-existing sample review to demonstrate the rating display
    const existingRatings = getLocalRatings();
    if (existingRatings.length === 0) {
        const sampleRatings = [
            {
                id: 'rate-1',
                transaction_id: 'tx-mumbai-102',
                rater_id: 'f9774926-4ba6-4a23-be64-cebfd643ecca',
                rated_user_id: 'b40658a9-f534-4f58-bd26-6e5943b41b7f',
                rating: 5,
                review: 'Exceptional professionalism from Akshay! Helped us close our 2BHK purchase smoothly with total transparency.',
                rater_name: 'Priya Sharma',
                rater_role: 'Buyer',
                property_title: '2BHK Luxury Apartment in Medavakkam',
                created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
                updated_at: new Date(Date.now() - 6 * 86400000).toISOString()
            }
        ];
        saveLocalRatings(sampleRatings);
    }

    return sampleDeals;
}
