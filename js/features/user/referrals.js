/**
 * User Referrals Feature
 * Referral links generation, tracking statistics, and clipboard sharing.
 */

import { supabase } from '../../core/supabase-client.js';
import { getReferrals } from '../../services/user-service.js';
import { showToast } from '../../ui/toast.js';

export function generateReferralUrl(userId, role = 'broker') {
    return `${window.location.origin}/login.html?ref=${userId}&role=${role}`;
}

export async function fetchReferralStats(userId) {
    try {
        const referredUsers = await getReferrals(userId);
        const invitedCount = referredUsers.length;
        const activeCount = referredUsers.filter(u => u.role === 'Buyer' || u.role === 'Broker').length;
        return { invitedCount, activeCount, referredUsers };
    } catch (err) {
        console.error('Failed to fetch referral stats:', err);
        return { invitedCount: 0, activeCount: 0, referredUsers: [] };
    }
}

export function copyReferralLinkToClipboard(url) {
    return navigator.clipboard.writeText(url)
        .then(() => {
            showToast('Referral link copied to clipboard!');
            return true;
        })
        .catch(() => {
            showToast('Failed to copy referral link.', true);
            return false;
        });
}
