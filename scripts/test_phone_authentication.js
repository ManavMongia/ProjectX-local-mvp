/**
 * ProjectX Automated Feature Test Suite:
 * Secure Phone Number Authentication Without SMS Charges
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    SUPPORTED_COUNTRY_CODES,
    AUTH_PHONE_DOMAIN,
    normalizePhoneNumber,
    validatePhoneNumber,
    validatePassword,
    phoneToAuthEmail,
    isPhoneAuthEmail,
    authEmailToPhone,
    formatPhoneDisplay,
    signInWithPhone,
    signUpWithPhone
} from '../js/services/phone-auth-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
    console.log('================================================================');
    console.log('ProjectX: Secure Phone Number Authentication Test Suite');
    console.log('================================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    function test(description, fn) {
        try {
            fn();
            console.log(`  ✓ PASS: ${description}`);
            passedTests++;
        } catch (err) {
            console.error(`  ✗ FAIL: ${description}`);
            console.error(`    ${err.message}`);
            failedTests++;
        }
    }

    async function asyncTest(description, fn) {
        try {
            await fn();
            console.log(`  ✓ PASS: ${description}`);
            passedTests++;
        } catch (err) {
            console.error(`  ✗ FAIL: ${description}`);
            console.error(`    ${err.message}`);
            failedTests++;
        }
    }

    // -------------------------------------------------------------
    // SECTION 1: PHONE NUMBER NORMALIZATION
    // -------------------------------------------------------------
    console.log('--- Section 1: Phone Normalization (E.164 & India Default) ---');

    test('Normalizes standard 10-digit Indian number to E.164 with +91', () => {
        assert.strictEqual(normalizePhoneNumber('9876543210'), '+919876543210');
    });

    test('Cleans spaces, dashes, parentheses and dots', () => {
        assert.strictEqual(normalizePhoneNumber('98765-43210'), '+919876543210');
        assert.strictEqual(normalizePhoneNumber('98765 43210'), '+919876543210');
        assert.strictEqual(normalizePhoneNumber('(98765) 43210'), '+919876543210');
        assert.strictEqual(normalizePhoneNumber('987.654.3210'), '+919876543210');
    });

    test('Strips domestic leading zero (09876543210 -> +919876543210)', () => {
        assert.strictEqual(normalizePhoneNumber('09876543210'), '+919876543210');
    });

    test('Handles national prefix without plus (919876543210 -> +919876543210)', () => {
        assert.strictEqual(normalizePhoneNumber('919876543210'), '+919876543210');
    });

    test('Preserves already valid E.164 +91 format', () => {
        assert.strictEqual(normalizePhoneNumber('+919876543210'), '+919876543210');
    });

    test('Converts international 00 prefix to + (00919876543210 -> +919876543210)', () => {
        assert.strictEqual(normalizePhoneNumber('00919876543210'), '+919876543210');
    });

    test('Normalizes other supported countries (USA +1, UAE +971, UK +44, Singapore +65)', () => {
        assert.strictEqual(normalizePhoneNumber('4155552671', '+1'), '+14155552671');
        assert.strictEqual(normalizePhoneNumber('+14155552671', '+1'), '+14155552671');
        assert.strictEqual(normalizePhoneNumber('501234567', '+971'), '+971501234567');
        assert.strictEqual(normalizePhoneNumber('7911123456', '+44'), '+447911123456');
        assert.strictEqual(normalizePhoneNumber('81234567', '+65'), '+6581234567');
    });

    test('Handles empty and invalid inputs gracefully', () => {
        assert.strictEqual(normalizePhoneNumber(''), '');
        assert.strictEqual(normalizePhoneNumber(null), '');
        assert.strictEqual(normalizePhoneNumber(undefined), '');
    });

    // -------------------------------------------------------------
    // SECTION 2: PHONE & PASSWORD VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Phone & Password Validation Boundaries ---');

    test('Rejects empty phone number with clear error message', () => {
        const res = validatePhoneNumber('');
        assert.strictEqual(res.valid, false);
        assert(res.error.includes('Please enter your mobile phone number'));
    });

    test('Rejects invalid characters or too short phone numbers', () => {
        const res = validatePhoneNumber('12345');
        assert.strictEqual(res.valid, false);
    });

    test('Rejects Indian mobile numbers starting with invalid digits (1-5)', () => {
        const res1 = validatePhoneNumber('2345678901', '+91');
        assert.strictEqual(res1.valid, false);
        assert(res1.error.includes('Indian mobile numbers must begin with 6, 7, 8, or 9'));

        const res2 = validatePhoneNumber('5123456789', '+91');
        assert.strictEqual(res2.valid, false);
    });

    test('Accepts valid Indian mobile numbers starting with 6, 7, 8, or 9', () => {
        ['9876543210', '8123456789', '7012345678', '6234567890'].forEach(phone => {
            const res = validatePhoneNumber(phone, '+91');
            assert.strictEqual(res.valid, true, `Phone ${phone} should be valid`);
            assert(res.normalized.startsWith('+91'));
        });
    });

    test('Validates international phone numbers correctly', () => {
        const resUS = validatePhoneNumber('4155552671', '+1');
        assert.strictEqual(resUS.valid, true);

        const resUAE = validatePhoneNumber('501234567', '+971');
        assert.strictEqual(resUAE.valid, true);

        const resInvalidLength = validatePhoneNumber('123', '+1');
        assert.strictEqual(resInvalidLength.valid, false);
    });

    test('Validates password length requirements', () => {
        assert.strictEqual(validatePassword('').valid, false);
        assert.strictEqual(validatePassword('12345').valid, false);
        assert.strictEqual(validatePassword('123456').valid, true);
        assert.strictEqual(validatePassword('StrongPassword!2026').valid, true);
    });

    // -------------------------------------------------------------
    // SECTION 3: DETERMINISTIC ZERO-SMS AUTH ENGINE
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Deterministic Zero-SMS Identity Mapping ---');

    test('Maps normalized phone to internal zero-SMS auth email', () => {
        const email = phoneToAuthEmail('+919876543210');
        assert.strictEqual(email, 'phone_919876543210@auth.projectx.local');
        assert.strictEqual(isPhoneAuthEmail(email), true);
    });

    test('Correctly identifies non-phone emails', () => {
        assert.strictEqual(isPhoneAuthEmail('user@gmail.com'), false);
        assert.strictEqual(isPhoneAuthEmail('moksh4179@gmail.com'), false);
        assert.strictEqual(isPhoneAuthEmail(null), false);
    });

    test('Extracts normalized phone back from auth email', () => {
        const phone = authEmailToPhone('phone_919876543210@auth.projectx.local');
        assert.strictEqual(phone, '+919876543210');
    });

    test('Formats phone display for clean user presentation', () => {
        assert.strictEqual(formatPhoneDisplay('+919876543210'), '+91 98765 43210');
        assert.strictEqual(formatPhoneDisplay('+14155552671'), '+1 (415) 555-2671');
    });

    // -------------------------------------------------------------
    // SECTION 4: CLIENT-BOUNDARY INTEGRATION & ZERO-SMS ENFORCEMENT
    // -------------------------------------------------------------
    console.log('\n--- Section 4: Supabase Auth Zero-SMS Invocation Tests ---');

    await asyncTest('signInWithPhone uses zero-SMS deterministic path when phone provider is disabled', async () => {
        let otpOrSmsCalled = false;
        let signInWithPasswordCalled = false;
        let emailUsed = null;

        const mockSupabase = {
            auth: {
                signInWithOtp: async () => {
                    otpOrSmsCalled = true;
                    throw new Error('SMS should never be called!');
                },
                signInWithPassword: async (credentials) => {
                    signInWithPasswordCalled = true;
                    if (credentials.phone) {
                        // Native phone provider is disabled in project
                        const err = new Error('Unsupported phone provider');
                        err.code = 'phone_provider_disabled';
                        return { data: null, error: err };
                    }
                    if (credentials.email) {
                        emailUsed = credentials.email;
                        return {
                            data: {
                                user: { id: 'mock-user-123', email: credentials.email },
                                session: { access_token: 'mock-jwt-token' }
                            },
                            error: null
                        };
                    }
                }
            }
        };

        const result = await signInWithPhone('9876543210', 'securePass123', '+91', mockSupabase);
        assert.strictEqual(otpOrSmsCalled, false, 'No SMS OTP service must ever be called');
        assert.strictEqual(signInWithPasswordCalled, true, 'signInWithPassword must be called');
        assert.strictEqual(emailUsed, 'phone_919876543210@auth.projectx.local');
        assert.strictEqual(result.user.id, 'mock-user-123');
        assert.strictEqual(result.session.access_token, 'mock-jwt-token');
    });

    await asyncTest('signUpWithPhone creates zero-SMS phone credentials with metadata', async () => {
        let otpOrSmsCalled = false;
        let signUpCalled = false;
        let metadataPassed = null;

        const mockSupabase = {
            auth: {
                signInWithOtp: async () => {
                    otpOrSmsCalled = true;
                    throw new Error('SMS should never be called!');
                },
                signUp: async (params) => {
                    signUpCalled = true;
                    if (params.phone) {
                        const err = new Error('Unsupported phone provider');
                        err.code = 'phone_provider_disabled';
                        return { data: null, error: err };
                    }
                    metadataPassed = params.options?.data;
                    return {
                        data: {
                            user: { id: 'new-user-456', email: params.email },
                            session: { access_token: 'new-jwt-token' }
                        },
                        error: null
                    };
                }
            }
        };

        const result = await signUpWithPhone(
            '9876543210',
            'securePass123',
            { name: 'Amit Kumar', role: 'Buyer', countryCode: '+91' },
            mockSupabase
        );

        assert.strictEqual(otpOrSmsCalled, false);
        assert.strictEqual(signUpCalled, true);
        assert.strictEqual(metadataPassed.phone, '+919876543210');
        assert.strictEqual(metadataPassed.full_name, 'Amit Kumar');
        assert.strictEqual(metadataPassed.role, 'Buyer');
        assert.strictEqual(result.user.id, 'new-user-456');
    });

    await asyncTest('Rejects duplicate phone accounts with clear user message', async () => {
        const mockSupabase = {
            auth: {
                signUp: async (params) => {
                    if (params.phone) {
                        const err = new Error('Unsupported phone provider');
                        err.code = 'phone_provider_disabled';
                        return { data: null, error: err };
                    }
                    return {
                        data: null,
                        error: { message: 'User already registered' }
                    };
                }
            }
        };

        await assert.rejects(
            async () => {
                await signUpWithPhone('9876543210', 'securePass123', {}, mockSupabase);
            },
            /already exists/
        );
    });

    // -------------------------------------------------------------
    // SECTION 5: HTML UI AUDIT (login.html and signup.html)
    // -------------------------------------------------------------
    console.log('\n--- Section 5: UI Elements & Design Consistency Audit ---');

    ['login.html', 'signup.html'].forEach(page => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', page), 'utf8');

        test(`${page}: Contains Auth Method Switcher (Phone & Email)`, () => {
            assert(html.includes('id="auth-method-selector"'), `${page} must contain #auth-method-selector`);
            assert(html.includes('id="method-btn-phone"'), `${page} must contain #method-btn-phone`);
            assert(html.includes('id="method-btn-email"'), `${page} must contain #method-btn-email`);
        });

        test(`${page}: Contains Country Code selection with +91 default`, () => {
            assert(html.includes('id="country-code-select"'), `${page} must contain #country-code-select`);
            assert(html.includes('value="+91" selected'), `${page} must default to +91 India`);
            assert(html.includes('value="+1"'), `${page} must support USA (+1)`);
            assert(html.includes('value="+971"'), `${page} must support UAE (+971)`);
        });

        test(`${page}: Contains Phone Input with tel attributes`, () => {
            assert(html.includes('id="input-phone"'), `${page} must contain #input-phone`);
            assert(html.includes('type="tel"'), `${page} must have type="tel"`);
        });

        test(`${page}: Contains Password show/hide toggle`, () => {
            assert(html.includes('id="toggle-password-btn"'), `${page} must contain #toggle-password-btn`);
        });

        test(`${page}: Clearly informs users of Password Login (No SMS)`, () => {
            assert(html.includes('No SMS'), `${page} must display badge or indication of No SMS charge`);
        });
    });

    // -------------------------------------------------------------
    // SECTION 6: SECURITY & CREDENTIAL LEAK AUDIT
    // -------------------------------------------------------------
    console.log('\n--- Section 6: Security & Credentials Audit ---');

    test('Source code does not leak service-role secret key', () => {
        const filesToScan = [
            'login.html',
            'signup.html',
            'auth.js',
            'js/services/auth-service.js',
            'js/services/phone-auth-service.js',
            'js/features/authentication/login.js',
            'js/features/authentication/signup.js'
        ];

        filesToScan.forEach(file => {
            const content = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
            assert(!content.includes('service_role'), `${file} must not contain service_role secret!`);
            assert(!content.includes('supabase_admin'), `${file} must not contain supabase_admin secret!`);
        });
    });

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Results: ${passedTests} passed, ${failedTests} failed.`);
    console.log('================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
});
