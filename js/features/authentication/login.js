/**
 * Login Feature Module
 * Controls the polished Buyer, Seller & Broker authentication experience,
 * role switching, credentials submission, forgot password, and guest login.
 */

import { signIn, getUserProfile, createUserProfile, signOut, resetPassword } from '../../services/auth-service.js';
import { signInWithPhone, validatePhoneNumber, validatePassword, formatPhoneDisplay } from '../../services/phone-auth-service.js';
import { resolveCurrentPage, isAuthOrLoginPage } from '../../core/app-state.js';
import { getReferredBy, setReferredBy } from '../../core/auth-state.js';
import { login } from './auth-guard.js';
import { updateReferralBanner, processSignUp } from './signup.js';
import { showToast } from '../../ui/toast.js';

export function initLoginPage() {
    const currentPage = resolveCurrentPage();
    if (!isAuthOrLoginPage(currentPage)) return;

    // Role definitions metadata for customer portal
    const roleMeta = {
        'Buyer': {
            icon: 'home',
            tagline: 'Browse & save homes',
            description: 'Find your next home and explore verified residential and commercial properties.',
            nameLabel: 'Full Name',
            namePlaceholder: 'e.g. Rahul Sharma',
            submitSignIn: 'Sign In as Buyer',
            submitSignUp: 'Create Buyer Account'
        },
        'Seller': {
            icon: 'sell',
            tagline: 'List & value property',
            description: 'List your property, request expert valuations, and connect with verified buyers.',
            nameLabel: 'Full Name / Property Owner',
            namePlaceholder: 'e.g. Priya Patel',
            submitSignIn: 'Sign In as Seller',
            submitSignUp: 'Create Seller Account'
        },
        'Broker': {
            icon: 'domain',
            tagline: 'Manage listings & leads',
            description: 'Manage exclusive property listings, client inquiries, custom filters, and deal pipelines.',
            nameLabel: 'Full Name / Agency Name',
            namePlaceholder: 'e.g. Apex Realty Partners',
            submitSignIn: 'Sign In as Broker',
            submitSignUp: 'Create Broker Account'
        },
        // Fallbacks for staff portal (staff-login.html)
        'Admin': {
            icon: 'admin_panel_settings',
            tagline: 'Platform administration',
            description: 'Full supervisory access to manage users, moderation queue, and system audits.',
            nameLabel: 'Full Name',
            namePlaceholder: 'e.g. Admin User',
            submitSignIn: 'Sign In as Admin',
            submitSignUp: 'Create Admin Account'
        },
        'Employee': {
            icon: 'badge',
            tagline: 'Verification & support staff',
            description: 'Review pending property listings, conduct verifications, and monitor platform compliance.',
            nameLabel: 'Full Name',
            namePlaceholder: 'e.g. Staff Officer',
            submitSignIn: 'Sign In as Staff',
            submitSignUp: 'Create Staff Account'
        }
    };

    const roleCards = document.querySelectorAll('.account-type-card, #role-tabs button');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const roleBadgeText = document.getElementById('role-pill-badge');
    const roleDescText = document.getElementById('role-description-text');
    const roleDescBox = document.getElementById('role-description-box');

    const authMethodSelector = document.getElementById('auth-method-selector');
    const methodBtnPhone = document.getElementById('method-btn-phone');
    const methodBtnEmail = document.getElementById('method-btn-email');
    const countryCodeSelect = document.getElementById('country-code-select');

    const nameField = document.getElementById('name-field');
    const nameLabel = document.getElementById('name-label');
    const nameInput = document.getElementById('input-name');

    const phoneField = document.getElementById('phone-field');
    const phoneInput = document.getElementById('input-phone');

    const emailField = document.getElementById('email-field');
    const emailInput = document.getElementById('input-email');

    const passwordField = document.getElementById('password-field');
    const passwordInput = document.getElementById('input-password');

    const confirmPasswordField = document.getElementById('confirm-password-field');
    const confirmPasswordInput = document.getElementById('input-confirm-password');

    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const toggleConfirmPasswordBtn = document.getElementById('toggle-confirm-password-btn');

    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const backToLoginBtn = document.getElementById('back-to-login-btn');
    const guestContainer = document.getElementById('guest-container');

    const modeText = document.getElementById('mode-text');
    const toggleModeBtn = document.getElementById('toggle-mode-btn');
    const submitBtn = document.getElementById('sign-in-btn');
    const alertBox = document.getElementById('auth-alert');

    const urlParams = new URLSearchParams(window.location.search);
    
    // Auth Mode: 'signin' | 'signup' | 'forgot'
    let currentMode = (urlParams.get('mode') === 'signup' || currentPage === 'signup.html') 
        ? 'signup' 
        : (urlParams.get('mode') === 'forgot' ? 'forgot' : 'signin');

    let currentAuthMethod = authMethodSelector ? 'phone' : 'email';

    let selectedRole = currentPage === 'staff-login.html' ? 'Admin' : 'Buyer';
    let referrerInfo = null;

    function setAuthMethod(method) {
        currentAuthMethod = method;
        if (methodBtnPhone && methodBtnEmail) {
            if (method === 'phone') {
                methodBtnPhone.className = 'auth-method-tab flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 bg-white text-slate-900 shadow-sm cursor-pointer';
                methodBtnEmail.className = 'auth-method-tab flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-900 cursor-pointer';
            } else {
                methodBtnEmail.className = 'auth-method-tab flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 bg-white text-slate-900 shadow-sm cursor-pointer';
                methodBtnPhone.className = 'auth-method-tab flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-900 cursor-pointer';
            }
        }
        updateUI();
    }

    if (methodBtnPhone) {
        methodBtnPhone.onclick = (e) => {
            e.preventDefault();
            setAuthMethod('phone');
        };
    }
    if (methodBtnEmail) {
        methodBtnEmail.onclick = (e) => {
            e.preventDefault();
            setAuthMethod('email');
        };
    }

    function showAlert(message, type = 'error') {
        if (!alertBox) return;
        const iconSpan = alertBox.querySelector('.material-symbols-outlined') || alertBox.querySelector('span');
        const textSpan = alertBox.querySelector('.alert-text') || alertBox;

        alertBox.className = 'flex items-start gap-3 p-3.5 rounded-xl text-xs font-semibold border transition-all mb-4 ' +
            (type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800');

        if (iconSpan) {
            iconSpan.textContent = type === 'error' ? 'error' : 'check_circle';
            iconSpan.className = 'material-symbols-outlined text-[18px] shrink-0 mt-0.5 ' +
                (type === 'error' ? 'text-rose-600' : 'text-emerald-600');
        }
        if (textSpan) {
            textSpan.textContent = message;
        }
        alertBox.classList.remove('hidden');
    }

    function clearAlert() {
        if (!alertBox) return;
        alertBox.classList.add('hidden');
    }

    function updateUI() {
        clearAlert();
        const meta = roleMeta[selectedRole] || roleMeta['Buyer'];

        // 1. Header Titles & Subtitles
        if (formTitle) {
            if (currentMode === 'signup') {
                formTitle.textContent = `Create ${selectedRole} Account`;
            } else if (currentMode === 'forgot') {
                formTitle.textContent = 'Reset Password';
            } else {
                formTitle.textContent = `Welcome Back`;
            }
        }

        if (formSubtitle) {
            if (currentMode === 'signup') {
                formSubtitle.innerHTML = `Register as <span class="font-bold text-slate-900">${selectedRole}</span> on India's modern real estate platform.`;
            } else if (currentMode === 'forgot') {
                formSubtitle.textContent = 'Enter your registered email address to receive password reset instructions.';
            } else {
                formSubtitle.innerHTML = `Accessing your <span class="font-bold text-slate-900">${selectedRole}</span> account and portfolio.`;
            }
        }

        // 2. Role Badge & Description Box
        if (roleBadgeText) {
            roleBadgeText.textContent = `${selectedRole} Portal`;
        }
        if (roleDescText) {
            roleDescText.textContent = meta.description;
        }

        // Hide role selector during 'forgot' password flow for simplicity
        const accountTypeContainer = document.getElementById('account-type-selection');
        if (accountTypeContainer) {
            accountTypeContainer.style.display = currentMode === 'forgot' ? 'none' : 'block';
        }

        // 3. Field Visibilities
        if (authMethodSelector) {
            authMethodSelector.style.display = currentMode === 'forgot' ? 'none' : 'flex';
        }

        if (nameField) {
            nameField.style.display = currentMode === 'signup' ? 'block' : 'none';
            if (nameLabel) nameLabel.textContent = meta.nameLabel;
            if (nameInput) nameInput.placeholder = meta.namePlaceholder;
        }

        if (currentMode === 'forgot') {
            if (phoneField) phoneField.style.display = 'none';
            if (emailField) emailField.style.display = 'block';
        } else {
            if (phoneField) {
                phoneField.style.display = currentAuthMethod === 'phone' ? 'block' : 'none';
            }
            if (emailField) {
                emailField.style.display = currentAuthMethod === 'email' ? 'block' : 'none';
            }
        }

        if (passwordField) {
            passwordField.style.display = currentMode === 'forgot' ? 'none' : 'block';
        }

        if (confirmPasswordField) {
            confirmPasswordField.style.display = currentMode === 'signup' ? 'block' : 'none';
        }

        if (forgotPasswordLink) {
            forgotPasswordLink.style.display = currentMode === 'signin' ? 'inline-block' : 'none';
        }

        if (guestContainer) {
            guestContainer.style.display = currentMode === 'signin' ? 'block' : 'none';
        }

        if (backToLoginBtn) {
            backToLoginBtn.style.display = currentMode === 'forgot' ? 'flex' : 'none';
        }

        // 4. Submit Button Text
        if (submitBtn) {
            if (currentMode === 'signup') {
                submitBtn.textContent = meta.submitSignUp;
            } else if (currentMode === 'forgot') {
                submitBtn.textContent = 'Send Reset Instructions';
            } else {
                submitBtn.textContent = meta.submitSignIn;
            }
        }

        // 5. Mode Switch Footer Text
        if (modeText) {
            if (currentMode === 'signup') {
                modeText.innerHTML = `Already have an account? <button id="toggle-mode-btn" type="button" class="font-bold text-slate-900 hover:underline ml-1">Sign In</button>`;
            } else if (currentMode === 'forgot') {
                modeText.innerHTML = `Remembered your credentials? <button id="toggle-mode-btn" type="button" class="font-bold text-slate-900 hover:underline ml-1">Back to Sign In</button>`;
            } else {
                modeText.innerHTML = `New to ProjectX? <button id="toggle-mode-btn" type="button" class="font-bold text-slate-900 hover:underline ml-1">Create Account</button>`;
            }

            const newToggleBtn = document.getElementById('toggle-mode-btn');
            if (newToggleBtn) {
                newToggleBtn.onclick = (e) => {
                    e.preventDefault();
                    if (currentMode === 'signin') {
                        currentMode = 'signup';
                    } else {
                        currentMode = 'signin';
                    }
                    updateUI();
                };
            }
        }

        updateReferralBanner(currentMode === 'signup', referrerInfo);
    }

    function selectRole(role) {
        if (!role) return;
        let normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        // Fallback safety
        if (!roleMeta[normalizedRole]) {
            normalizedRole = 'Buyer';
        }
        selectedRole = normalizedRole;

        roleCards.forEach(card => {
            const cardRole = (card.getAttribute('data-role') || card.textContent || '').trim().toLowerCase();
            const isMatch = cardRole.toLowerCase() === selectedRole.toLowerCase();

            // Toggle accessibility attributes
            card.setAttribute('aria-checked', isMatch ? 'true' : 'false');
            card.setAttribute('tabindex', isMatch ? '0' : '-1');

            // Toggle card classes
            if (isMatch) {
                card.classList.remove('border-slate-200', 'bg-white', 'text-slate-600', 'hover:border-slate-300');
                card.classList.add('border-slate-900', 'bg-slate-900/5', 'text-slate-900', 'ring-1', 'ring-slate-900', 'shadow-sm');
                
                const checkIcon = card.querySelector('.role-check-indicator');
                if (checkIcon) checkIcon.classList.remove('hidden');

                const mainIcon = card.querySelector('.role-main-icon');
                if (mainIcon) {
                    mainIcon.classList.remove('text-slate-400');
                    mainIcon.classList.add('text-slate-900');
                }
            } else {
                card.classList.remove('border-slate-900', 'bg-slate-900/5', 'text-slate-900', 'ring-1', 'ring-slate-900', 'shadow-sm');
                card.classList.add('border-slate-200', 'bg-white', 'text-slate-600', 'hover:border-slate-300');

                const checkIcon = card.querySelector('.role-check-indicator');
                if (checkIcon) checkIcon.classList.add('hidden');

                const mainIcon = card.querySelector('.role-main-icon');
                if (mainIcon) {
                    mainIcon.classList.remove('text-slate-900');
                    mainIcon.classList.add('text-slate-400');
                }
            }
        });

        updateUI();
    }

    // Role Card container event delegation
    const accountTypeGrid = document.getElementById('account-type-grid');
    if (accountTypeGrid) {
        accountTypeGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.account-type-card');
            if (card) {
                e.preventDefault();
                const role = card.getAttribute('data-role') || card.textContent.trim();
                if (role) selectRole(role);
            }
        });
    }

    // Role Card click listeners & Keyboard navigation
    const roleCardList = Array.from(roleCards);
    roleCardList.forEach((card, idx) => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const role = card.getAttribute('data-role') || card.textContent.trim();
            selectRole(role);
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIdx = (idx + 1) % roleCardList.length;
                const nextCard = roleCardList[nextIdx];
                nextCard.focus();
                const nextRole = nextCard.getAttribute('data-role') || nextCard.textContent.trim();
                if (nextRole) selectRole(nextRole);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIdx = (idx - 1 + roleCardList.length) % roleCardList.length;
                const prevCard = roleCardList[prevIdx];
                prevCard.focus();
                const prevRole = prevCard.getAttribute('data-role') || prevCard.textContent.trim();
                if (prevRole) selectRole(prevRole);
            } else if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                e.preventDefault();
                const role = card.getAttribute('data-role') || card.textContent.trim();
                if (role) selectRole(role);
            }
        });
    });

    if (typeof window !== 'undefined') {
        window._loginState = {
            selectRole,
            getSelectedRole: () => selectedRole,
            getCurrentMode: () => currentMode
        };
    }

    // Forgot password navigation
    if (forgotPasswordLink) {
        forgotPasswordLink.onclick = (e) => {
            e.preventDefault();
            currentMode = 'forgot';
            updateUI();
        };
    }

    if (backToLoginBtn) {
        backToLoginBtn.onclick = (e) => {
            e.preventDefault();
            currentMode = 'signin';
            updateUI();
        };
    }

    // Show/Hide password toggles
    function setupPasswordToggle(btn, input) {
        if (!btn || !input) return;
        btn.onclick = (e) => {
            e.preventDefault();
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            const icon = btn.querySelector('.material-symbols-outlined') || btn;
            icon.textContent = isPassword ? 'visibility_off' : 'visibility';
        };
    }

    setupPasswordToggle(togglePasswordBtn, passwordInput);
    setupPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput);

    // Initial role selection from URL params or default
    const initialRole = urlParams.get('role');
    if (initialRole) {
        selectRole(initialRole);
    } else {
        selectRole(currentPage === 'staff-login.html' ? 'Admin' : 'Buyer');
    }

    // Referral invite parameter handling
    const refParam = urlParams.get('ref') || getReferredBy() || localStorage.getItem('pendingRef');
    if (refParam) {
        setReferredBy(refParam);
        getUserProfile(refParam).then((profile) => {
            if (profile) {
                referrerInfo = profile;
                updateReferralBanner(currentMode === 'signup', referrerInfo);
            }
        });
    }

    // Enter key listeners
    [emailInput, passwordInput, confirmPasswordInput, nameInput, phoneInput].forEach(el => {
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && submitBtn && !submitBtn.disabled) {
                    e.preventDefault();
                    submitBtn.click();
                }
            });
        }
    });

    // Form Submit Handler
    if (submitBtn) {
        submitBtn.onclick = async (e) => {
            e.preventDefault();
            clearAlert();

            const email = emailInput?.value?.trim() || '';
            const phone = phoneInput?.value?.trim() || '';
            const countryCode = countryCodeSelect?.value || '+91';
            const password = passwordInput?.value || '';
            const confirmPassword = confirmPasswordInput?.value || '';
            const name = nameInput?.value?.trim() || '';

            // 1. Validation for Forgot Password
            if (currentMode === 'forgot') {
                if (!email) {
                    showAlert('Please enter your email address to reset your password.');
                    emailInput?.focus();
                    return;
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    showAlert('Please enter a valid email address.');
                    emailInput?.focus();
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending instructions...';

                try {
                    await resetPassword(email, `${window.location.origin}/login.html`);
                    showAlert('Password reset link sent! Check your email inbox to proceed.', 'success');
                    showToast('Recovery link sent to your email.');
                } catch (err) {
                    console.error('Password reset error:', err);
                    showAlert(err.message || 'Failed to send recovery link. Please try again.');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Reset Instructions';
                }
                return;
            }

            // 2. Validation for Sign In and Sign Up
            let validatedPhone = null;
            if (currentAuthMethod === 'phone') {
                const phoneCheck = validatePhoneNumber(phone, countryCode);
                if (!phoneCheck.valid) {
                    showAlert(phoneCheck.error);
                    phoneInput?.focus();
                    return;
                }
                validatedPhone = phoneCheck.normalized;
            } else {
                if (!email) {
                    showAlert('Please enter your email address.');
                    emailInput?.focus();
                    return;
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    showAlert('Please enter a valid email address.');
                    emailInput?.focus();
                    return;
                }
            }

            const passCheck = validatePassword(password);
            if (!passCheck.valid) {
                showAlert(passCheck.error);
                passwordInput?.focus();
                return;
            }

            // 3. Additional Sign Up Validations
            if (currentMode === 'signup') {
                if (!name) {
                    showAlert('Please enter your full name to create an account.');
                    nameInput?.focus();
                    return;
                }

                if (!confirmPassword) {
                    showAlert('Please confirm your password.');
                    confirmPasswordInput?.focus();
                    return;
                }

                if (password !== confirmPassword) {
                    showAlert('Passwords do not match. Please verify and re-enter.');
                    confirmPasswordInput?.focus();
                    return;
                }
            }

            // 4. Execution
            submitBtn.disabled = true;
            submitBtn.textContent = currentMode === 'signup' ? 'Creating account...' : 'Signing in...';

            try {
                if (currentMode === 'signup') {
                    const signedIn = await processSignUp({
                        email,
                        password,
                        name,
                        phone,
                        countryCode,
                        selectedRole,
                        referrerId: refParam,
                        authMethod: currentAuthMethod
                    });

                    if (signedIn) return;
                    
                    currentMode = 'signin';
                    updateUI();
                    showAlert('Account created! Please sign in with your credentials.', 'success');
                } else {
                    let data;
                    if (currentAuthMethod === 'phone') {
                        data = await signInWithPhone(phone, password, countryCode);
                    } else {
                        data = await signIn(email, password);
                    }

                    // Fetch user profile from Supabase
                    let profile = await getUserProfile(data.user.id);
                    if (!profile) {
                        const defaultName = currentAuthMethod === 'phone'
                            ? formatPhoneDisplay(validatedPhone)
                            : email.split('@')[0];
                        profile = await createUserProfile({
                            id: data.user.id,
                            full_name: defaultName,
                            role: selectedRole,
                            phone: currentAuthMethod === 'phone' ? validatedPhone : undefined
                        });
                    }

                    // Enforce role authorization
                    let matched = (profile.role === selectedRole);
                    if (!matched && profile.role === 'Admin' && (selectedRole === 'Broker' || selectedRole === 'Seller' || selectedRole === 'Employee' || selectedRole === 'Admin')) {
                        matched = true;
                    }

                    if (!matched) {
                        await signOut();
                        // Automatically switch the UI to their actual role so they can immediately log in
                        selectRole(profile.role);
                        throw new Error(`This account is registered as a ${profile.role}. We've switched the account type above to ${profile.role} — please sign in.`);
                    }

                    showToast(`Signed in successfully as ${profile.role}!`, 'success');
                    login(profile.role, profile.full_name, selectedRole);
                }
            } catch (err) {
                console.error('Authentication error:', err);
                let msg = err.message || 'Authentication failed.';

                // Translate cryptic error codes into friendly user feedback
                if (err.status === 400 || msg.toLowerCase().includes('invalid login credentials')) {
                    msg = currentAuthMethod === 'phone'
                        ? 'Phone number or password is incorrect. Please verify your details.'
                        : 'Email or password is incorrect. Please verify your details.';
                } else if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already exists')) {
                    msg = currentAuthMethod === 'phone'
                        ? 'An account with this phone number already exists. Please sign in instead.'
                        : 'An account with this email already exists. Please sign in instead.';
                    currentMode = 'signin';
                    updateUI();
                }

                showAlert(msg, 'error');
                showToast(msg);
            } finally {
                submitBtn.disabled = false;
                const meta = roleMeta[selectedRole] || roleMeta['Buyer'];
                submitBtn.textContent = currentMode === 'signup' ? meta.submitSignUp : meta.submitSignIn;
            }
        };
    }

    // Guest Browsing button
    const guestBtn = document.getElementById('guest-btn');
    if (guestBtn) {
        guestBtn.onclick = (e) => {
            e.preventDefault();
            login('Guest');
        };
    }
}
