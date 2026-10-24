import {
    resolveSupabaseConfig,
    validateSupabaseUrl,
    validateSupabaseKey,
    maskKey,
    assertSingleValue,
    parseJwtPayload
} from '../lib/supabase.js';

let passed = 0;
let failed = 0;

function assert(description, condition, details = '') {
    if (condition) {
        console.log(`  ✅ PASS: ${description}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${description}`);
        if (details) console.error(`     Details: ${details}`);
        failed++;
    }
}

function expectError(description, fn, expectedSnippet = null) {
    try {
        fn();
        console.error(`  ❌ FAIL: ${description} (expected error was not thrown)`);
        failed++;
    } catch (err) {
        if (!expectedSnippet || err.message.includes(expectedSnippet)) {
            console.log(`  ✅ PASS: ${description}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${description} (threw "${err.message}", expected snippet "${expectedSnippet}")`);
            failed++;
        }
    }
}

function makeSyntheticJwt(payloadObj) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = 'synthetic_signature_1234567890';
    return `${header}.${payload}.${signature}`;
}

console.log('================================================================');
console.log('ProjectX: Supabase Configuration & Key Security Test Suite');
console.log('================================================================');

// --- Section 1: Both Valid Credentials Supplied Together ---
console.log('\n--- Section 1: Both Valid Credentials Supplied Together ---');
{
    const validUrl = 'https://testproject.supabase.co';
    const validJwtKey = makeSyntheticJwt({
        iss: 'supabase',
        ref: 'testproject',
        role: 'anon',
        iat: 1700000000,
        exp: 2000000000
    });

    const config = resolveSupabaseConfig({
        url: validUrl,
        key: validJwtKey,
        isLocalApproved: false
    });

    assert('Valid paired credentials resolve successfully', config.url === validUrl && config.key === validJwtKey);
    assert('Resolved configuration flags isFallback as false', config.isFallback === false);

    const validPublishableKey = 'sb_publishable_testproject_abc123xyz789';
    const config2 = resolveSupabaseConfig({
        url: validUrl,
        key: validPublishableKey,
        isLocalApproved: false
    });
    assert('Valid modern publishable key resolves successfully', config2.key === validPublishableKey);
}

// --- Section 2: Missing Credentials & Partial Configuration ---
console.log('\n--- Section 2: Missing Credentials & Partial Configuration ---');
{
    const validUrl = 'https://testproject.supabase.co';
    const validKey = makeSyntheticJwt({ iss: 'supabase', ref: 'testproject', role: 'anon' });

    expectError(
        'Missing URL with key present throws explicit configuration error',
        () => resolveSupabaseConfig({ url: '', key: validKey, isLocalApproved: true }),
        'Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together'
    );

    expectError(
        'Missing Key with URL present throws explicit configuration error',
        () => resolveSupabaseConfig({ url: validUrl, key: '', isLocalApproved: true }),
        'Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together'
    );

    expectError(
        'Null URL with valid key throws explicit pairing error',
        () => resolveSupabaseConfig({ url: null, key: validKey, isLocalApproved: true }),
        'Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together'
    );
}

// --- Section 3: Malformed & Invalid URLs ---
console.log('\n--- Section 3: Malformed & Invalid URLs ---');
{
    expectError('Rejects relative URL',
        () => validateSupabaseUrl('/relative/url/path'),
        'is not a valid absolute URL'
    );

    expectError('Rejects invalid non-HTTP protocol (ftp://)',
        () => validateSupabaseUrl('ftp://testproject.supabase.co'),
        'must use http or https protocol'
    );

    expectError('Rejects embedded user credentials in URL',
        () => validateSupabaseUrl('https://admin:secret@testproject.supabase.co'),
        'must not contain embedded credentials'
    );

    expectError('Rejects query parameters on base project URL',
        () => validateSupabaseUrl('https://testproject.supabase.co?token=123'),
        'must not include query parameters'
    );

    expectError('Rejects subpath segments on base URL',
        () => validateSupabaseUrl('https://testproject.supabase.co/rest/v1'),
        'must not contain subpaths'
    );

    expectError('Rejects arbitrary untrusted external origins',
        () => validateSupabaseUrl('https://attacker-hosted-api.example.com'),
        'is not a recognized Supabase domain'
    );

    const localUrlResult = validateSupabaseUrl('http://127.0.0.1:54321');
    assert('Accepts local development URL endpoint (127.0.0.1:54321)', localUrlResult.origin === 'http://127.0.0.1:54321');

    const customDomainResult = validateSupabaseUrl('https://auth.custom-domain.com', 'auth.custom-domain.com');
    assert('Accepts explicitly permitted custom domain', customDomainResult.origin === 'https://auth.custom-domain.com');
}

// --- Section 4: Multiline & Variable-Prefixed .env Input ---
console.log('\n--- Section 4: Multiline & Variable-Prefixed .env Input ---');
{
    const multilineUrl = "https://testproject.supabase.co\nVITE_SUPABASE_ANON_KEY=something";
    expectError('Rejects multiline URL from accidental whole-file .env copy-paste',
        () => validateSupabaseUrl(multilineUrl),
        'contains line breaks'
    );

    const prefixedUrl = "VITE_SUPABASE_URL=https://testproject.supabase.co";
    expectError('Rejects variable assignment syntax in URL value',
        () => validateSupabaseUrl(prefixedUrl),
        'contains variable assignment syntax'
    );

    const multilineKey = "eyJhbGciOi...\nANOTHER_VAR=123";
    expectError('Rejects multiline key from pasted .env block',
        () => validateSupabaseKey(multilineKey),
        'contains line breaks'
    );

    const prefixedKey = "VITE_SUPABASE_ANON_KEY=sb_publishable_12345";
    expectError('Rejects variable assignment syntax in Anon Key value',
        () => validateSupabaseKey(prefixedKey),
        'contains variable assignment syntax'
    );
}

// --- Section 5: URL and Key Project Reference Mismatch ---
console.log('\n--- Section 5: URL and Key Project Reference Mismatch ---');
{
    const projectAUrl = 'https://project-alpha.supabase.co';
    const projectBKey = makeSyntheticJwt({
        iss: 'supabase',
        ref: 'project-bravo',
        role: 'anon'
    });

    expectError(
        'Rejects cross-project pairing where URL references Project A but Key references Project B',
        () => resolveSupabaseConfig({
            url: projectAUrl,
            key: projectBKey,
            isLocalApproved: false
        }),
        'Project reference mismatch'
    );

    const matchedKey = makeSyntheticJwt({
        iss: 'supabase',
        ref: 'project-alpha',
        role: 'anon'
    });
    const matchedConfig = resolveSupabaseConfig({
        url: projectAUrl,
        key: matchedKey,
        isLocalApproved: false
    });
    assert('Allows correctly matching project reference in URL and Key', matchedConfig.url === projectAUrl);
}

// --- Section 6: Key Format Validation & Privilege Enforcement ---
console.log('\n--- Section 6: Key Format Validation & Privilege Enforcement ---');
{
    // Valid formats
    const validPublishable = 'sb_publishable_test_project_key_12345';
    assert('Accepts sb_publishable_ key format', validateSupabaseKey(validPublishable).type === 'publishable');

    const validAnonPrefixed = 'sb_anon_test_project_key_12345';
    assert('Accepts sb_anon_ key format', validateSupabaseKey(validAnonPrefixed).type === 'publishable');

    const validAnonJwt = makeSyntheticJwt({ iss: 'supabase', ref: 'project-alpha', role: 'anon' });
    assert('Accepts complete legacy anon JWT', validateSupabaseKey(validAnonJwt, 'project-alpha').type === 'jwt');

    // Rejection of Personal Access Tokens (Management API)

const patToken = ['sbp', '1234567890abcdef1234567890abcdef12345678'].join('_');
    expectError('Rejects administrative Personal Access Token (sbp_)',
        () => validateSupabaseKey(patToken),
        'Detected Supabase Personal Access Token (sbp_)'
    );

    // Rejection of Secret Keys
    const secretKeyPrefix = 'sbs_1234567890abcdef1234567890abcdef12345678';
    expectError('Rejects secret key with sbs_ prefix',
        () => validateSupabaseKey(secretKeyPrefix),
        'Detected secret key prefix'
    );

    // Rejection of privileged administrative JWT keys
    const privilegedRoleName = ['service', 'role'].join('_');
    const privilegedJwt = makeSyntheticJwt({
        iss: 'supabase',
        ref: 'project-alpha',
        role: privilegedRoleName
    });
    expectError('Rejects privileged administrative service-role JWT',
        () => validateSupabaseKey(privilegedJwt, 'project-alpha'),
        'Detected privileged administrative key in public client environment'
    );

    // Rejection of non-anon role (e.g. authenticated user session token used as anon key)
    const userSessionJwt = makeSyntheticJwt({
        iss: 'supabase',
        ref: 'project-alpha',
        role: 'authenticated'
    });
    expectError('Rejects authenticated user token masquerading as public anon key',
        () => validateSupabaseKey(userSessionJwt, 'project-alpha'),
        'Client key role must be "anon"'
    );

    // Rejection of arbitrary strings
    expectError('Rejects arbitrary non-JWT non-publishable strings',
        () => validateSupabaseKey('invalid-random-secret-key-content'),
        'is not a valid anon JWT or publishable key format'
    );
}

// --- Section 7: Production Safety vs Approved Local Development ---
console.log('\n--- Section 7: Production Safety vs Approved Local Development ---');
{
    // Production: Missing credentials MUST throw, never silently fall back
    expectError(
        'Production fails fast when credentials are not configured (isLocalApproved = false)',
        () => resolveSupabaseConfig({
            url: '',
            key: '',
            isLocalApproved: false
        }),
        'Missing required VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in production'
    );

    // Approved local development: Zero-config fallback is granted when neither is supplied
    const localDevConfig = resolveSupabaseConfig({
        url: '',
        key: '',
        isLocalApproved: true
    });
    assert('Approved local development grants fallback when credentials are empty',
        localDevConfig.isFallback === true && Boolean(localDevConfig.url) && Boolean(localDevConfig.key)
    );

    // But if local dev provides partial/broken credentials, it still throws explicitly rather than falling back
    expectError(
        'Approved local development still throws if URL is provided without Key',
        () => resolveSupabaseConfig({
            url: 'https://custom.supabase.co',
            key: '',
            isLocalApproved: true
        }),
        'Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together'
    );
}

// --- Section 8: Masking Key Utility Safety ---
console.log('\n--- Section 8: Masking Key Utility Safety ---');
{
    const sampleSecret = 'sbp_1234567890supersecretkeycontent';
    const masked = maskKey(sampleSecret);
    assert('Masked key hides actual secret contents', !masked.includes('supersecretkeycontent'));
    assert('Masked key contains placeholder indicators', masked.includes('...***'));
    assert('Handles empty key safely', maskKey('') === '<empty>');
}

console.log('\n================================================================');
console.log(`Test Suite Results: ${passed} Passed, ${failed} Failed`);
console.log('================================================================\n');

if (failed > 0) {
    process.exit(1);
}
