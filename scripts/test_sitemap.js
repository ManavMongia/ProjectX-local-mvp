/**
 * Test: XML Sitemap and Robots.txt Configuration
 * Run: node scripts/test_sitemap.js
 *
 * Verifies:
 *  1. sitemap.xml exists in production output (dist/sitemap.xml) and root.
 *  2. XML syntax is well-formed and valid according to Sitemaps Protocol 0.9.
 *  3. All URLs use canonical production domain (https://project-x-local-mvp.vercel.app).
 *  4. No localhost, staging, preview, or development URLs exist.
 *  5. No duplicate URLs exist in the sitemap.
 *  6. Private authentication and dashboard pages are excluded.
 *  7. All eligible public static pages are included.
 *  8. Eligible property detail URLs follow proper routing (property-details.html?id=ID).
 *  9. XML characters (&, <, >, ", ') are correctly escaped.
 * 10. robots.txt exists, references the sitemap, and restricts private routes.
 * 11. Existing sitemap.html is preserved and distinct from sitemap.xml.
 * 12. Listing eligibility correctly filters active/sold_out vs pending/draft.
 * 13. Lastmod timestamps are valid W3C dates and not fabricated for static pages.
 * 14. Priority and changefreq are not arbitrarily added.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PRODUCTION_DOMAIN,
    PUBLIC_STATIC_ROUTES,
    PRIVATE_ROUTES,
    escapeXml,
    isListingEligibleForSitemap,
    formatLastmodDate,
    buildPropertyDetailUrl,
    generateSitemapXml,
    generateRobotsTxt
} from '../js/services/sitemap-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
    if (condition) {
        console.log(`  ✅ ${desc}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${desc}`);
        failed++;
    }
}

console.log('\n── Section 1: Sitemap Service Unit Tests ──\n');

// 1. XML Escaping
assert('Escapes & -> &amp;', escapeXml('A&B') === 'A&amp;B');
assert('Escapes < -> &lt; and > -> &gt;', escapeXml('<tag>') === '&lt;tag&gt;');
assert('Escapes quotes and apostrophes', escapeXml(`"Hello" & 'World'`) === '&quot;Hello&quot; &amp; &apos;World&apos;');
assert('Handles empty string and null safely', escapeXml('') === '' && escapeXml(null) === '');

// 2. Listing Eligibility
assert('Active status is eligible', isListingEligibleForSitemap({ id: 1, status: 'Active' }) === true);
assert('active (lowercase) is eligible', isListingEligibleForSitemap({ id: 2, status: 'active' }) === true);
assert('sold_out is eligible', isListingEligibleForSitemap({ id: 3, status: 'sold_out' }) === true);
assert('sold out (with space) is eligible', isListingEligibleForSitemap({ id: 4, status: 'sold out' }) === true);
assert('Pending is NOT eligible', isListingEligibleForSitemap({ id: 5, status: 'Pending' }) === false);
assert('Pending_Review is NOT eligible', isListingEligibleForSitemap({ id: 6, status: 'Pending_Review' }) === false);
assert('Pending_Field_Verification is NOT eligible', isListingEligibleForSitemap({ id: 7, status: 'Pending_Field_Verification' }) === false);
assert('Draft is NOT eligible', isListingEligibleForSitemap({ id: 8, status: 'Draft' }) === false);
assert('Rejected is NOT eligible', isListingEligibleForSitemap({ id: 9, status: 'Rejected' }) === false);
assert('Suspended is NOT eligible', isListingEligibleForSitemap({ id: 10, status: 'Suspended' }) === false);
assert('Missing ID is NOT eligible', isListingEligibleForSitemap({ status: 'Active' }) === false);
assert('Null listing is NOT eligible', isListingEligibleForSitemap(null) === false);

// 3. Lastmod Formatting
assert('Valid ISO timestamp formats to YYYY-MM-DD', formatLastmodDate('2026-10-15T14:30:00Z') === '2026-10-15');
assert('Invalid date returns null', formatLastmodDate('invalid-date') === null);
assert('Null date returns null', formatLastmodDate(null) === null);

// 4. URL Builder
assert('Builds correct property details URL', buildPropertyDetailUrl(101) === 'https://project-x-local-mvp.vercel.app/property-details.html?id=101');
assert('Handles string IDs with special chars safely', buildPropertyDetailUrl('prop 101') === 'https://project-x-local-mvp.vercel.app/property-details.html?id=prop%20101');

// 5. XML Sitemap Generation
const mockListings = [
    { id: 101, status: 'Active', created_at: '2026-10-10T10:00:00Z' },
    { id: 102, status: 'Pending', created_at: '2026-10-11T10:00:00Z' }, // excluded
    { id: 103, status: 'sold_out', created_at: '2026-10-12T10:00:00Z' },
    { id: 101, status: 'Active', created_at: '2026-10-10T10:00:00Z' }  // duplicate id
];
const generatedXml = generateSitemapXml(mockListings, PRODUCTION_DOMAIN);

assert('Generated XML contains declaration', generatedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert('Generated XML contains sitemaps.org namespace', generatedXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
assert('Includes public homepage', generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/</loc>'));
assert('Includes public properties search page', generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/properties.html</loc>'));
assert('Includes public map page', generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/map.html</loc>'));
assert('Includes active listing 101', generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/property-details.html?id=101</loc>'));
assert('Includes sold_out listing 103', generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/property-details.html?id=103</loc>'));
assert('Excludes pending listing 102', !generatedXml.includes('id=102'));
assert('Deduplicates duplicate listing 101', (generatedXml.match(/id=101/g) || []).length === 1);
assert('Listing 101 has valid lastmod', generatedXml.includes('<lastmod>2026-10-10</lastmod>'));
assert('Static pages do NOT have fabricated lastmod', !generatedXml.includes('<loc>https://project-x-local-mvp.vercel.app/properties.html</loc>\n    <lastmod>'));
assert('Does NOT contain arbitrary priority tags', !generatedXml.includes('<priority>'));
assert('Does NOT contain arbitrary changefreq tags', !generatedXml.includes('<changefreq>'));

console.log('\n── Section 2: Production Sitemap File Inspection ──\n');

const sitemapPath = path.join(rootDir, 'sitemap.xml');
const publicSitemapPath = path.join(rootDir, 'public', 'sitemap.xml');
const distSitemapPath = path.join(rootDir, 'dist', 'sitemap.xml');

assert('sitemap.xml exists at repository root', fs.existsSync(sitemapPath));
assert('public/sitemap.xml exists for Vite static serving', fs.existsSync(publicSitemapPath));
assert('dist/sitemap.xml exists in Vite production build output', fs.existsSync(distSitemapPath));

const productionXml = fs.readFileSync(sitemapPath, 'utf8');

// XML validation
assert('Production sitemap starts with XML declaration', productionXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assert('Production sitemap has valid <urlset> opening tag', productionXml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
assert('Production sitemap closes with </urlset>', productionXml.trim().endsWith('</urlset>'));

// Extract all <loc> URLs
const locRegex = /<loc>(.*?)<\/loc>/g;
const urls = [];
let match;
while ((match = locRegex.exec(productionXml)) !== null) {
    urls.push(match[1]);
}

assert('Production sitemap contains URLs', urls.length > 0);
console.log(`  ℹ Total URLs in production sitemap: ${urls.length}`);

// Domain validation
const allUseProductionDomain = urls.every(u => u.startsWith(PRODUCTION_DOMAIN));
assert('All URLs strictly use canonical production domain https://project-x-local-mvp.vercel.app', allUseProductionDomain);

const noLocalhost = urls.every(u => !u.includes('localhost') && !u.includes('127.0.0.1'));
assert('No localhost or 127.0.0.1 URLs exist', noLocalhost);

const noPreview = urls.every(u => !u.includes('vercel.live') && !u.includes('-git-') && !u.includes('.preview.'));
assert('No temporary preview or branch preview URLs exist', noPreview);

// Duplicate check
const uniqueUrls = new Set(urls);
assert('No duplicate URLs exist in the sitemap', uniqueUrls.size === urls.length);

// Public pages included
assert('Homepage is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/'));
assert('Properties search is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/properties.html'));
assert('Map view is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/map.html'));
assert('Sell page is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/sell.html'));
assert('Terms page is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/terms.html'));
assert('Privacy policy is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/privacy.html'));
assert('HTML sitemap directory is present', uniqueUrls.has('https://project-x-local-mvp.vercel.app/sitemap.html'));

// Private pages excluded
const privatePageNames = [
    'login.html',
    'signup.html',
    'staff-login.html',
    'admin-panel.html',
    'employee-panel.html',
    'broker-dashboard.html',
    'profile.html',
    'my-property.html',
    'rental-agreement.html',
    'maintenance.html',
    'setup.html',
    'shared-filter.html'
];
for (const priv of privatePageNames) {
    const hasPriv = urls.some(u => u.includes(priv));
    assert(`Private page ${priv} is excluded from sitemap`, !hasPriv);
}

// Property Detail URLs
const propertyUrls = urls.filter(u => u.includes('/property-details.html?id='));
assert('Property detail URLs are present in sitemap', propertyUrls.length > 0);
console.log(`  ℹ Number of public property details indexed: ${propertyUrls.length}`);

const allPropertyUrlsValid = propertyUrls.every(u => {
    return /^https:\/\/project-x-local-mvp\.vercel\.app\/property-details\.html\?id=[a-zA-Z0-9_\-]+$/.test(u);
});
assert('All property detail URLs follow canonical format (/property-details.html?id=ID)', allPropertyUrlsValid);

console.log('\n── Section 3: robots.txt Inspection ──\n');

const robotsPath = path.join(rootDir, 'robots.txt');
const publicRobotsPath = path.join(rootDir, 'public', 'robots.txt');
const distRobotsPath = path.join(rootDir, 'dist', 'robots.txt');

assert('robots.txt exists at repository root', fs.existsSync(robotsPath));
assert('public/robots.txt exists for Vite static serving', fs.existsSync(publicRobotsPath));
assert('dist/robots.txt exists in Vite production build output', fs.existsSync(distRobotsPath));

const robotsTxt = fs.readFileSync(robotsPath, 'utf8');

assert('robots.txt specifies User-agent: *', robotsTxt.includes('User-agent: *'));
assert('robots.txt references Sitemap: https://project-x-local-mvp.vercel.app/sitemap.xml', robotsTxt.includes('Sitemap: https://project-x-local-mvp.vercel.app/sitemap.xml'));
assert('robots.txt allows public root (Allow: /)', robotsTxt.includes('Allow: /'));
assert('robots.txt allows sitemap.xml', robotsTxt.includes('Allow: /sitemap.xml'));
assert('robots.txt allows property-details.html', robotsTxt.includes('Allow: /property-details.html'));
assert('robots.txt disallows admin-panel.html', robotsTxt.includes('Disallow: /admin-panel.html'));
assert('robots.txt disallows broker-dashboard.html', robotsTxt.includes('Disallow: /broker-dashboard.html'));
assert('robots.txt disallows employee-panel.html', robotsTxt.includes('Disallow: /employee-panel.html'));
assert('robots.txt disallows login.html', robotsTxt.includes('Disallow: /login.html'));
assert('robots.txt disallows signup.html', robotsTxt.includes('Disallow: /signup.html'));
assert('robots.txt disallows profile.html', robotsTxt.includes('Disallow: /profile.html'));

console.log('\n── Section 4: Existing HTML Sitemap Preservation ──\n');

const htmlSitemapPath = path.join(rootDir, 'sitemap.html');
assert('sitemap.html (HTML visitor sitemap) is preserved', fs.existsSync(htmlSitemapPath));
const htmlSitemapContent = fs.readFileSync(htmlSitemapPath, 'utf8');
assert('sitemap.html retains human-facing directory content', htmlSitemapContent.includes('Site Directory Map'));

console.log(`\n========================================`);
console.log(`XML Sitemap & Robots.txt Tests: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
