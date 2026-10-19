/**
 * Phone Authentication Service
 * Secure, zero-SMS-charge phone number authentication for ProjectX.
 * Handles international phone normalization, validation, and Supabase Auth integration.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

export const SUPPORTED_COUNTRY_CODES = [
    { code: '+91', country: 'India', flag: '🇮🇳', length: 10, pattern: /^[6-9]\d{9}$/ },
    { code: '+1', country: 'USA / Canada', flag: '🇺🇸', length: 10, pattern: /^\d{10}$/ },
    { code: '+44', country: 'United Kingdom', flag: '🇬🇧', length: 10, pattern: /^\d{10}$/ },
    { code: '+971', country: 'UAE', flag: '🇦🇪', length: 9, pattern: /^\d{9}$/ },
    { code: '+65', country: 'Singapore', flag: '🇸🇬', length: 8, pattern: /^\d{8}$/ },
    { code: '+61', country: 'Australia', flag: '🇦🇺', length: 9, pattern: /^\d{9}$/ },
    { code: '+49', country: 'Germany', flag: '🇩🇪', length: 10, pattern: /^\d{10,11}$/ }
];

export const AUTH_PHONE_DOMAIN = 'auth.projectx.local';

/**
 * Normalizes a raw phone number input to a standardized E.164 international string.
 *
 * @param {string} rawPhone - Raw phone number entered by user.
 * @param {string} [defaultCountryCode='+91'] - Default country code if none provided.
 * @returns {string} E.164 formatted phone number (e.g., '+919876543210')
 */
export function normalizePhoneNumber(rawPhone, defaultCountryCode = '+91') {
    if (!rawPhone || typeof rawPhone !== 'string') return '';

    let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');

    // Handle leading 00 as international +
    if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
    }

    // If starts with +, extract digits
    if (cleaned.startsWith('+')) {
        const digits = cleaned.slice(1).replace(/\D/g, '');
        return '+' + digits;
    }

    // Strip leading 0 for domestic numbers (e.g. 09876543210 -> 9876543210)
    const digitsOnly = cleaned.replace(/\D/g, '');
    let normalizedDigits = digitsOnly;
    if (normalizedDigits.startsWith('0') && normalizedDigits.length > 10) {
        normalizedDigits = normalizedDigits.slice(1);
    }

    const cleanDefaultCode = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;

    // If digits already include the country code prefix (e.g. 919876543210 when default is +91)
    const prefixDigits = cleanDefaultCode.replace(/\D/g, '');
    if (normalizedDigits.startsWith(prefixDigits) && normalizedDigits.length > prefixDigits.length + 8) {
        return '+' + normalizedDigits;
    }

    return `${cleanDefaultCode}${normalizedDigits}`;
}

/**
 * Validates a phone number based on its country code and E.164 specifications.
 *
 * @param {string} rawPhone
 * @param {string} [countryCode='+91']
 * @returns {{valid: boolean, normalized: string|null, error: string|null}}
 */
export function validatePhoneNumber(rawPhone, countryCode = '+91') {
    if (!rawPhone || typeof rawPhone !== 'string' || !rawPhone.trim()) {
        return {
            valid: false,
            normalized: null,
            error: 'Please enter your mobile phone number.'
        };
    }

    const normalized = normalizePhoneNumber(rawPhone, countryCode);
    const digitsOnly = normalized.replace(/\D/g, '');

    // General E.164 sanity check: + followed by 7 to 15 digits
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(normalized)) {
        return {
            valid: false,
            normalized: null,
            error: 'Invalid phone number format. Please check the entered digits.'
        };
    }

    // Specific validation for India (+91)
    if (normalized.startsWith('+91')) {
        const nationalNumber = digitsOnly.slice(2); // Remove 91
        if (nationalNumber.length !== 10) {
            return {
                valid: false,
                normalized: null,
                error: 'Please enter a valid 10-digit Indian mobile number.'
            };
        }
        if (!/^[6-9]/.test(nationalNumber)) {
            return {
                valid: false,
                normalized: null,
                error: 'Indian mobile numbers must begin with 6, 7, 8, or 9.'
            };
        }
    } else {
        // Other supported country codes validation
        const countryMeta = SUPPORTED_COUNTRY_CODES.find(c => normalized.startsWith(c.code));
        if (countryMeta) {
            const nationalPart = digitsOnly.slice(countryMeta.code.replace(/\D/g, '').length);
            if (!countryMeta.pattern.test(nationalPart)) {
                return {
                    valid: false,
                    normalized: null,
                    error: `Please enter a valid phone number for ${countryMeta.country} (${countryMeta.code}).`
                };
            }
        }
    }

    return {
        valid: true,
        normalized,
        error: null
    };
}

/**
 * Validates password requirements.
 *
 * @param {string} password
 * @returns {{valid: boolean, error: string|null}}
 */
export function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Please enter your password.' };
    }
    if (password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters long.' };
    }
    return { valid: true, error: null };
}

/**
 * Deterministically maps an E.164 normalized phone number to an internal auth identity.
 * Enables zero-SMS, password-authenticated logins via Supabase's native auth engine.
 *
 * @param {string} normalizedPhone - e.g. '+919876543210'
 * @returns {string} e.g. 'phone_919876543210@auth.projectx.local'
 */
export function phoneToAuthEmail(normalizedPhone) {
    const digits = String(normalizedPhone).replace(/\D/g, '');
    return `phone_${digits}@${AUTH_PHONE_DOMAIN}`;
}

/**
 * Checks whether an email was generated from a phone-identity mapping.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isPhoneAuthEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return email.startsWith('phone_') && email.endsWith(`@${AUTH_PHONE_DOMAIN}`);
}

/**
 * Extracts the E.164 phone number from a phone-identity email.
 *
 * @param {string} email
 * @returns {string|null} e.g. '+919876543210'
 */
export function authEmailToPhone(email) {
    if (!isPhoneAuthEmail(email)) return null;
    const match = email.match(/^phone_(\d+)@/);
    if (!match) return null;
    return `+${match[1]}`;
}

/**
 * Formats an E.164 phone number for clean visual display (e.g. '+91 98765 43210').
 *
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneDisplay(phone) {
    if (!phone) return '';
    const norm = normalizePhoneNumber(phone);
    if (norm.startsWith('+91') && norm.length === 13) {
        return `+91 ${norm.slice(3, 8)} ${norm.slice(8)}`;
    }
    if (norm.startsWith('+1') && norm.length === 12) {
        return `+1 (${norm.slice(2, 5)}) ${norm.slice(5, 8)}-${norm.slice(8)}`;
    }
    return norm;
}

/**
 * Signs in a user using their phone number and password.
 * Attempts native Supabase phone auth first, and seamlessly falls back to
 * the deterministic zero-SMS phone-identity mapping.
 *
 * @param {string} rawPhone
 * @param {string} password
 * @param {string} [countryCode='+91']
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<{user: Object, session: Object}>}
 */
export async function signInWithPhone(rawPhone, password, countryCode = '+91', supabaseClient = supabase) {
    const phoneCheck = validatePhoneNumber(rawPhone, countryCode);
    if (!phoneCheck.valid) {
        throw new Error(phoneCheck.error);
    }
    const passCheck = validatePassword(password);
    if (!passCheck.valid) {
        throw new Error(passCheck.error);
    }

    const normalized = phoneCheck.normalized;

    // 1. Try native Supabase phone login if provider is enabled
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            phone: normalized,
            password
        });
        if (!error && data?.session) {
            return data;
        }
        // If error is invalid credentials or user not found, throw it directly
        if (error && error.code !== 'phone_provider_disabled') {
            throw error;
        }
    } catch (err) {
        if (err.code !== 'phone_provider_disabled') {
            throw err;
        }
    }

    // 2. Deterministic zero-SMS phone auth
    const authEmail = phoneToAuthEmail(normalized);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: authEmail,
        password
    });

    if (error) {
        if (error.message?.toLowerCase().includes('invalid login credentials')) {
            throw new Error('Phone number or password is incorrect. Please verify your credentials.');
        }
        throw error;
    }

    return data;
}

/**
 * Registers a new user using their phone number and password.
 * Ensures zero SMS charges and creates profile record in Supabase.
 *
 * @param {string} rawPhone
 * @param {string} password
 * @param {Object} [options={}]
 * @param {string} [options.name='']
 * @param {string} [options.role='Buyer']
 * @param {string} [options.countryCode='+91']
 * @param {string|null} [options.referrerId=null]
 * @param {Object} [supabaseClient=supabase]
 * @returns {Promise<{user: Object, session: Object}>}
 */
export async function signUpWithPhone(
    rawPhone,
    password,
    { name = '', role = 'Buyer', countryCode = '+91', referrerId = null } = {},
    supabaseClient = supabase
) {
    const phoneCheck = validatePhoneNumber(rawPhone, countryCode);
    if (!phoneCheck.valid) {
        throw new Error(phoneCheck.error);
    }
    const passCheck = validatePassword(password);
    if (!passCheck.valid) {
        throw new Error(passCheck.error);
    }

    const normalized = phoneCheck.normalized;

    // 1. Try native Supabase phone sign up if provider is enabled
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            phone: normalized,
            password,
            options: {
                data: {
                    phone: normalized,
                    full_name: name,
                    role
                }
            }
        });
        if (!error && data?.user) {
            return data;
        }
        if (error && error.code !== 'phone_provider_disabled') {
            throw error;
        }
    } catch (err) {
        if (err.code !== 'phone_provider_disabled') {
            throw err;
        }
    }

    // 2. Deterministic zero-SMS phone signup
    const authEmail = phoneToAuthEmail(normalized);
    const { data, error } = await supabaseClient.auth.signUp({
        email: authEmail,
        password,
        options: {
            data: {
                phone: normalized,
                full_name: name,
                role,
                auth_type: 'phone_password'
            }
        }
    });

    if (error) {
        if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('user already exists')) {
            throw new Error('An account with this phone number already exists. Please sign in instead.');
        }
        throw error;
    }

    return data;
}
