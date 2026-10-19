/**
 * Sitemap Service
 * Generates and validates XML sitemaps and robots.txt for ProjectX.
 * Zero DOM dependencies; fully testable in Node and browser.
 */

export const PRODUCTION_DOMAIN = 'https://project-x-local-mvp.vercel.app';

/**
 * Public, canonical, indexable static routes.
 * Homepage is represented by '/' (canonical root).
 */
export const PUBLIC_STATIC_ROUTES = [
    '/',
    '/properties.html',
    '/map.html',
    '/sell.html',
    '/terms.html',
    '/privacy.html',
    '/sitemap.html'
];

/**
 * Private, authenticated, dashboard, and administrative routes that must NOT be indexed.
 */
export const PRIVATE_ROUTES = [
    '/login.html',
    '/signup.html',
    '/staff-login.html',
    '/broker-dashboard.html',
    '/admin-panel.html',
    '/employee-panel.html',
    '/profile.html',
    '/my-property.html',
    '/rental-agreement.html',
    '/maintenance.html',
    '/setup.html',
    '/shared-filter.html'
];

/**
 * Escapes XML special characters according to XML specifications.
 *
 * @param {string} unsafe
 * @returns {string}
 */
export function escapeXml(unsafe) {
    if (!unsafe && unsafe !== 0) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Validates whether a listing is eligible for public search engine indexing.
 *
 * Business Rules:
 * - Must have a valid ID.
 * - Status must be 'Active' (or case-insensitive 'active') or 'sold_out' / 'sold'.
 * - Excludes Draft, Pending, Under Review, Pending_Field_Verification, Rejected, and Suspended listings.
 *
 * @param {Object} listing
 * @returns {boolean}
 */
export function isListingEligibleForSitemap(listing) {
    if (!listing || listing.id === undefined || listing.id === null) return false;
    const rawStatus = typeof listing.status === 'string' ? listing.status.trim().toLowerCase() : '';
    return rawStatus === 'active' || rawStatus === 'sold_out' || rawStatus === 'sold out' || rawStatus === 'sold';
}

/**
 * Formats a timestamp into W3C Datetime format (YYYY-MM-DD).
 * Returns null if timestamp is missing or invalid.
 *
 * @param {string|number|Date} dateValue
 * @returns {string|null}
 */
export function formatLastmodDate(dateValue) {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
}

/**
 * Constructs a canonical public property details URL.
 * Format: https://project-x-local-mvp.vercel.app/property-details.html?id=ID
 *
 * @param {string|number} listingId
 * @param {string} [baseUrl=PRODUCTION_DOMAIN]
 * @returns {string}
 */
export function buildPropertyDetailUrl(listingId, baseUrl = PRODUCTION_DOMAIN) {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    return `${cleanBase}/property-details.html?id=${encodeURIComponent(listingId)}`;
}

/**
 * Generates XML Sitemap string complying with official Sitemaps Protocol 0.9.
 *
 * Rules:
 * - Proper XML declaration and sitemaps.org namespace.
 * - Uses absolute production domain.
 * - Avoids duplicate URLs.
 * - Escapes XML characters.
 * - Uses reliable <lastmod> only when verified timestamp exists (e.g. listing created_at).
 * - Excludes arbitrary priority and changefreq.
 *
 * @param {Array<Object>} [listings=[]]
 * @param {string} [baseUrl=PRODUCTION_DOMAIN]
 * @returns {string}
 */
export function generateSitemapXml(listings = [], baseUrl = PRODUCTION_DOMAIN) {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const seenUrls = new Set();
    const urlEntries = [];

    // 1. Add Public Static Pages
    for (const route of PUBLIC_STATIC_ROUTES) {
        const fullUrl = route === '/' ? `${cleanBase}/` : `${cleanBase}${route}`;
        if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            urlEntries.push(`  <url>\n    <loc>${escapeXml(fullUrl)}</loc>\n  </url>`);
        }
    }

    // 2. Add Eligible Public Property Listings
    if (Array.isArray(listings)) {
        for (const listing of listings) {
            if (!isListingEligibleForSitemap(listing)) continue;

            const fullUrl = buildPropertyDetailUrl(listing.id, cleanBase);
            if (!seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                const lastmod = formatLastmodDate(listing.created_at || listing.updated_at);
                if (lastmod) {
                    urlEntries.push(`  <url>\n    <loc>${escapeXml(fullUrl)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`);
                } else {
                    urlEntries.push(`  <url>\n    <loc>${escapeXml(fullUrl)}</loc>\n  </url>`);
                }
            }
        }
    }

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        urlEntries.join('\n'),
        '</urlset>',
        ''
    ].join('\n');

    return xml;
}

/**
 * Generates robots.txt content referencing the XML sitemap and restricting private paths.
 *
 * @param {string} [baseUrl=PRODUCTION_DOMAIN]
 * @returns {string}
 */
export function generateRobotsTxt(baseUrl = PRODUCTION_DOMAIN) {
    const cleanBase = baseUrl.replace(/\/+$/, '');

    const lines = [
        '# robots.txt for ' + cleanBase,
        '',
        'User-agent: *',
        'Allow: /',
        'Allow: /properties.html',
        'Allow: /map.html',
        'Allow: /sell.html',
        'Allow: /terms.html',
        'Allow: /privacy.html',
        'Allow: /sitemap.html',
        'Allow: /property-details.html',
        'Allow: /sitemap.xml',
        '',
        '# Disallow private dashboards, user profiles, and authentication flows'
    ];

    for (const route of PRIVATE_ROUTES) {
        lines.push(`Disallow: ${route}`);
    }
    // Also disallow /signup rewrite alias
    lines.push('Disallow: /signup');

    lines.push('');
    lines.push(`Sitemap: ${cleanBase}/sitemap.xml`);
    lines.push('');

    return lines.join('\n');
}
