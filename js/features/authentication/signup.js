/**
 * Signup Feature Module
 * Handles signup logic, profile creation, and referral banner display.
 */

import { signUp, createUserProfile } from '../../services/auth-service.js';
import { getUserProfile } from '../../services/user-service.js';
import { getReferredBy, setReferredBy } from '../../core/auth-state.js';
import { login } from './auth-guard.js';
import { showToast } from '../../ui/toast.js';

export function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ')
               .filter(Boolean)
               .map(n => n[0])
               .join('')
               .toUpperCase()
               .slice(0, 2);
}

export function updateReferralBanner(isSignUp, referrerInfo) {
    let banner = document.getElementById('referral-banner');
    if (isSignUp && referrerInfo) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'referral-banner';
            banner.className = 'flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl mb-6';
            
            const form = document.querySelector('form');
            if (form) {
                form.parentNode.insertBefore(banner, form);
            }
        }
        
        const initials = getInitials(referrerInfo.full_name);
        const avatarHtml = referrerInfo.avatar_url 
            ? `<img src="${referrerInfo.avatar_url}" class="w-full h-full object-cover" alt="Referrer Avatar">`
            : `<span>${initials}</span>`;
        
        banner.innerHTML = `
            <div class="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
                ${avatarHtml}
            </div>
            <div class="flex-grow">
                <p class="text-xs text-slate-500 font-bold uppercase tracking-wider">Special Invitation</p>
                <p class="text-sm font-semibold text-slate-900">You've been invited by <span class="font-extrabold text-indigo-600">${referrerInfo.full_name}</span> to join EstatePro as a Broker</p>
            </div>
        `;
        banner.style.display = 'flex';
    } else {
        if (banner) {
            banner.style.display = 'none';
        }
    }
}

export async function processSignUp({ email, password, name, phone, selectedRole, referrerId }) {
    const data = await signUp(email, password);

    if (data.user) {
        const profileData = {
            id: data.user.id,
            full_name: name,
            role: selectedRole
        };
        if (phone) {
            profileData.phone = phone;
        }
        const referredBy = referrerId || getReferredBy();
        if (referredBy) {
            profileData.referred_by = referredBy;
            profileData.preferences = {
                referrer_id: referredBy
            };
        }
        await createUserProfile(profileData);
        setReferredBy(null);
    }

    showToast('Account created successfully!');
    
    if (data.session) {
        login(selectedRole, name);
        return true;
    }
    return false;
}
