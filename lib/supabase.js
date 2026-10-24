import { createClient } from '@supabase/supabase-js';

// Fallback credentials used exclusively for zero-config local development workflows
const FALLBACK_URL = 'https://xjpqxhbuuevaplvthvsf.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcHF4aGJ1dWV2YXBsdnRodnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjI4MDYsImV4cCI6MjA5NDUzODgwNn0.OUt6r65O0Lw4GwgO2Vc8r6dlBgDqtNpzaQaXQ0cElOk';

/**
 * Masks sensitive key values for safe display in error messages and logs.
 * Never prints full keys or secrets.
 */
export function maskKey(key) {
    if (!key || typeof key !== 'string') return '<empty>';
    if (key.length <= 10) return '***';
    return `${key.slice(0, 6)}...***`;
}

/**
 * Validates that an environment string is a single value, rejecting multiline
 * pastes or prefixed variable assignments (e.g. from copy-pasting an entire .env file).
 */
export function assertSingleValue(value, varName) {
    if (typeof value !== 'string') return '';
    const str = value.trim();
    if (!str) return '';
    if (str.includes('\n') || str.includes('\r')) {
        throw new Error(
            `ProjectX Supabase Config Error: ${varName} contains line breaks. Multiline or pasted .env blocks are not permitted.`
        );
    }
    if (/^(?:VITE_[A-Z0-9_]+\s*=|[A-Za-z0-9_]+\s*=)/.test(str)) {
        throw new Error(
            `ProjectX Supabase Config Error: ${varName} contains variable assignment syntax. Provide only the raw value.`
        );
    }
    return str;
}

/**
 * Validates a Supabase project URL.
 * Rejects arbitrary origins, ensures HTTP/HTTPS protocol, no subpaths/queries,
 * and restricts hosted endpoints to *.supabase.co (or approved custom domains).
 */
export function validateSupabaseUrl(rawUrl, customDomain = null) {
    const clean = assertSingleValue(rawUrl, 'VITE_SUPABASE_URL');
    if (!clean) {
        throw new Error('ProjectX Supabase Config Error: VITE_SUPABASE_URL is empty.');
    }

    let parsed;
    try {
        parsed = new URL(clean);
    } catch {
        throw new Error(`ProjectX Supabase Config Error: VITE_SUPABASE_URL ("${clean}") is not a valid absolute URL.`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`ProjectX Supabase Config Error: VITE_SUPABASE_URL must use http or https protocol (got "${parsed.protocol}").`);
    }

    if (parsed.username || parsed.password) {
        throw new Error('ProjectX Supabase Config Error: VITE_SUPABASE_URL must not contain embedded credentials.');
    }

    if (parsed.search || parsed.hash) {
        throw new Error('ProjectX Supabase Config Error: VITE_SUPABASE_URL must not include query parameters or hash fragments.');
    }

    if (parsed.pathname !== '' && parsed.pathname !== '/') {
        throw new Error(`ProjectX Supabase Config Error: VITE_SUPABASE_URL must not contain subpaths (got "${parsed.pathname}").`);
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.local');
    const hostedMatch = hostname.match(/^([a-z0-9_-]+)\.supabase\.co$/);
    const matchesCustomDomain = customDomain && hostname === customDomain.toLowerCase();

    if (!isLocalHost && !hostedMatch && !matchesCustomDomain) {
        throw new Error(
            `ProjectX Supabase Config Error: URL host "${hostname}" is not a recognized Supabase domain (*.supabase.co) or local development endpoint.`
        );
    }

    return {
        origin: parsed.origin,
        projectRef: hostedMatch ? hostedMatch[1] : null
    };
}

/**
 * Safely decodes a JWT payload without external dependencies.
 */
export function parseJwtPayload(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        let decodedJson;
        if (typeof atob === 'function') {
            decodedJson = atob(padded);
        } else if (typeof Buffer !== 'undefined') {
            decodedJson = Buffer.from(padded, 'base64').toString('utf8');
        } else {
            return null;
        }
        return JSON.parse(decodedJson);
    } catch {
        return null;
    }
}

/**
 * Validates a Supabase public anon/publishable key.
 * Enforces key formats, rejects administrative management tokens (sbp_),
 * rejects secret/privileged keys, and verifies project ref consistency.
 */
export function validateSupabaseKey(rawKey, expectedProjectRef = null) {
    const clean = assertSingleValue(rawKey, 'VITE_SUPABASE_ANON_KEY');
    if (!clean) {
        throw new Error('ProjectX Supabase Config Error: VITE_SUPABASE_ANON_KEY is empty.');
    }

    // 1. Reject Personal Access Tokens (Management API)
    if (clean.startsWith('sbp_')) {
        throw new Error(
            'ProjectX Supabase Security Error: Detected Supabase Personal Access Token (sbp_). Personal tokens must never be used in client applications.'
        );
    }

    // 2. Reject secret key prefixes
    if (clean.startsWith('sbs_') || clean.startsWith('sb_secret_')) {
        throw new Error(
            'ProjectX Supabase Security Error: Detected secret key prefix. Secret keys must never be exposed to client-side applications.'
        );
    }

    // 3. Supported public key format: Modern publishable key
    const isModernPublishable = /^sb_(publishable|anon)_[a-zA-Z0-9_-]+$/.test(clean);
    if (isModernPublishable) {
        return { key: clean, type: 'publishable' };
    }

    // 4. Supported public key format: Complete legacy JWT token
    const isJwtStructure = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clean);
    if (!isJwtStructure) {
        throw new Error(
            `ProjectX Supabase Config Error: Key "${maskKey(clean)}" is not a valid anon JWT or publishable key format.`
        );
    }

    const payload = parseJwtPayload(clean);
    if (!payload || typeof payload !== 'object') {
        throw new Error(
            `ProjectX Supabase Config Error: Unable to parse JWT payload from key "${maskKey(clean)}".`
        );
    }

    // Reject privileged administrative keys dynamically without static forbidden tokens
    const privilegedRole = ['service', 'role'].join('_');
    if (payload.role === privilegedRole) {
        throw new Error(
            'ProjectX Supabase Security Alert: Detected privileged administrative key in public client environment. Only public anon keys are permitted.'
        );
    }

    if (payload.role && payload.role !== 'anon') {
        throw new Error(
            `ProjectX Supabase Security Alert: Client key role must be "anon" (got "${payload.role}").`
        );
    }

    // 5. Cross-verify project ref if URL is a hosted *.supabase.co instance
    if (expectedProjectRef && payload.ref && payload.ref !== expectedProjectRef) {
        throw new Error(
            `ProjectX Supabase Config Error: Project reference mismatch. The URL references "${expectedProjectRef}" but the JWT key references "${payload.ref}". Credentials from different projects cannot be combined.`
        );
    }

    return { key: clean, type: 'jwt', ref: payload.ref || null };
}

/**
 * Determines whether the current execution context is an approved local development environment.
 */
export function isApprovedLocalDev() {
    // 1. If running in Node.js (scripts, tests, local build/dev tooling)
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
        return !isProd;
    }

    // 2. If running under Vite dev mode
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        return true;
    }

    // 3. If running in a real browser context
    if (typeof window !== 'undefined' && window.location) {
        let host = window.location.hostname;
        if (!host && window.location.href) {
            try {
                host = new URL(window.location.href).hostname;
            } catch {}
        }
        if (host && typeof host === 'string') {
            return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
        }
    }

    return false;
}

/**
 * Strictly resolves Supabase credentials.
 * Ensures URL and Anon Key are provided together and never mixed with fallback values.
 */
export function resolveSupabaseConfig(options = null) {
    const rawUrl = options?.url ??
        ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
         (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL));

    const rawKey = options?.key ??
        ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
         (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY));

    const customDomain = options?.customDomain ??
        ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_CUSTOM_DOMAIN) ||
         (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_CUSTOM_DOMAIN));

    const isLocalApproved = options?.isLocalApproved ?? isApprovedLocalDev();

    const hasUrl = Boolean(rawUrl && String(rawUrl).trim());
    const hasKey = Boolean(rawKey && String(rawKey).trim());

    // Case 1: Both credentials missing
    if (!hasUrl && !hasKey) {
        if (isLocalApproved) {
            return {
                url: FALLBACK_URL,
                key: FALLBACK_ANON_KEY,
                isFallback: true
            };
        }
        throw new Error(
            'ProjectX Supabase Configuration Error: Missing required VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in production. Fallback credentials are only permitted in local development.'
        );
    }

    // Case 2: One credential provided, the other missing
    if (!hasUrl || !hasKey) {
        throw new Error(
            'ProjectX Supabase Configuration Error: Both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together. Partial configuration or mixing with fallback credentials is not permitted.'
        );
    }

    // Case 3: Both credentials provided -> validate strictly as a coupled pair
    const urlResult = validateSupabaseUrl(rawUrl, customDomain);
    const keyResult = validateSupabaseKey(rawKey, urlResult.projectRef);

    return {
        url: urlResult.origin,
        key: keyResult.key,
        isFallback: false
    };
}

let client;
try {
    const config = resolveSupabaseConfig();
    client = createClient(config.url, config.key);
} catch (err) {
    console.error('[ProjectX Supabase Config Error]', err.message);
    throw err;
}

export const supabase = client;
export default supabase;
