/**
 * Login Feature Module
 * Controls the login & signup UI page, role switching, credentials submission, and guest login.
 */

import { signIn, getUserProfile, createUserProfile, signOut } from '../../services/auth-service.js';
import { resolveCurrentPage, isAuthOrLoginPage } from '../../core/app-state.js';
import { getReferredBy, setReferredBy } from '../../core/auth-state.js';
import { login } from './auth-guard.js';
import { updateReferralBanner, processSignUp } from './signup.js';
import { showToast } from '../../ui/toast.js';

export function initLoginPage() {
    const currentPage = resolveCurrentPage();
    if (!isAuthOrLoginPage(currentPage)) return;

    const roleButtons = document.querySelectorAll('#role-tabs button');
    const formTitle   = document.getElementById('form-title');
    const nameField   = document.getElementById('name-field') || document.getElementById('broker-name-field');
    const nameLabel   = document.getElementById('name-label');
    const modeText    = document.getElementById('mode-text');
    const toggleBtn   = document.getElementById('toggle-mode-btn');
    const signInBtn   = document.getElementById('sign-in-btn');
    let selectedRole  = 'Buyer';
    const urlParams   = new URLSearchParams(window.location.search);
    let isSignUp      = (urlParams.get('mode') === 'signup') || (currentPage === 'signup.html');
    let referrerInfo  = null;

    function updateUI() {
        if (formTitle) {
            formTitle.textContent = isSignUp ? `Join as ${selectedRole}` : `${selectedRole} Sign In`;
        }
        if (signInBtn) {
            signInBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
        }
        if (modeText) {
            modeText.innerHTML = isSignUp 
                ? `Already have an account? <button id="toggle-mode-btn" type="button" class="font-bold text-slate-900 hover:underline ml-1">Sign In</button>`
                : `Don't have an account? <button id="toggle-mode-btn" type="button" class="font-bold text-slate-900 hover:underline ml-1">Sign Up</button>`;
            
            const newToggleBtn = document.getElementById('toggle-mode-btn');
            if (newToggleBtn) {
                newToggleBtn.onclick = (e) => {
                    e.preventDefault();
                    isSignUp = !isSignUp;
                    updateUI();
                };
            }
        }
        if (nameField) {
            if (isSignUp) {
                nameField.style.display = 'block';
                if (nameLabel) nameLabel.textContent = selectedRole === 'Broker' ? 'Company/Full Name' : 'Full Name';
            } else {
                nameField.style.display = 'none';
            }
        }
        updateReferralBanner(isSignUp, referrerInfo);
    }

    function resetRoleTabs() {
        roleButtons.forEach(b => {
            b.className = 'flex-1 py-2.5 px-3 text-center text-[10px] font-black uppercase tracking-widest rounded-lg role-tab-inactive hover:text-slate-900 transition-colors';
        });
    }

    function selectRole(role) {
        let normalizedRole = role;
        if (role) {
            normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        }
        selectedRole = normalizedRole;
        resetRoleTabs();
        
        const btn = Array.from(roleButtons).find(b => b.textContent.trim().toLowerCase() === normalizedRole.toLowerCase());
        if (btn) {
            btn.className = 'flex-1 py-2.5 px-3 text-center text-[10px] font-black uppercase tracking-widest rounded-lg role-tab-active font-bold scale-105 transition-all';
        }

        updateUI();
    }

    roleButtons.forEach(btn => {
        btn.onclick = () => selectRole(btn.textContent.trim());
    });

    if (toggleBtn) {
        toggleBtn.onclick = (e) => {
            e.preventDefault();
            isSignUp = !isSignUp;
            updateUI();
        };
    }

    const urlRole = urlParams.get('role');
    if (urlRole) {
        selectRole(urlRole);
    } else {
        selectRole(currentPage === 'staff-login.html' ? 'Admin' : 'Buyer');
    }

    const refParam = urlParams.get('ref') || getReferredBy();
    if (refParam) {
        setReferredBy(refParam);
        getUserProfile(refParam).then((profile) => {
            if (profile) {
                referrerInfo = profile;
                updateReferralBanner(isSignUp, referrerInfo);
            }
        });
    }

    // Handle Enter key in form
    ['input-email', 'input-password', 'input-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && signInBtn && !signInBtn.disabled) {
                    e.preventDefault();
                    signInBtn.click();
                }
            });
        }
    });

    if (signInBtn) {
        signInBtn.onclick = async (e) => {
            e.preventDefault();
            const email = document.getElementById('input-email')?.value?.trim();
            const password = document.getElementById('input-password')?.value?.trim();
            const name = document.getElementById('input-name')?.value?.trim() || '';
            
            if (!email || !password) {
                showToast('Please enter both email and password.');
                return;
            }

            if (isSignUp && !name) {
                showToast('Please enter your name to create an account.');
                return;
            }

            signInBtn.disabled = true;
            signInBtn.textContent = 'Processing...';

            try {
                if (isSignUp) {
                    const signedIn = await processSignUp({
                        email,
                        password,
                        name,
                        selectedRole,
                        referrerId: refParam
                    });
                    if (signedIn) return;
                    isSignUp = false;
                    updateUI();
                } else {
                    const data = await signIn(email, password);

                    let profile = await getUserProfile(data.user.id);
                    if (!profile) {
                        profile = await createUserProfile({
                            id: data.user.id,
                            full_name: email.split('@')[0],
                            role: selectedRole
                        });
                    }

                    let matched = (profile.role === selectedRole);
                    if (!matched && profile.role === 'Admin' && (selectedRole === 'Broker' || selectedRole === 'Employee' || selectedRole === 'Admin')) {
                        matched = true;
                    }
                    if (!matched) {
                        await signOut();
                        throw new Error(`This account is registered as a ${profile.role}. Please select the correct role above.`);
                    }

                    login(profile.role, profile.full_name, selectedRole);
                }
            } catch (err) {
                console.error('Authentication error:', err);
                let msg = err.message || 'Authentication failed.';
                if (err.status === 400 && msg.toLowerCase().includes('invalid')) {
                    msg = 'Invalid email or password format. Please check your details.';
                }
                showToast(msg);
            } finally {
                signInBtn.disabled = false;
                signInBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
            }
        };
    }

    const guestBtn = document.getElementById('guest-btn');
    if (guestBtn) {
        guestBtn.onclick = (e) => {
            e.preventDefault();
            login('Guest');
        };
    }
}
