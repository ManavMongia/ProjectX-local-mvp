/**
 * Script: Generate Sitemap and Robots.txt (.mjs for universal Node.js compatibility)
 * Fetches actual public listings from Supabase and writes sitemap.xml and robots.txt
 * to both project root and public/ (for Vite dist inclusion).
 *
 * Usage: node scripts/generate_sitemap.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../js/core/supabase-client.js';
import {
    generateSitemapXml,
    generateRobotsTxt,
    isListingEligibleForSitemap,
    PRODUCTION_DOMAIN,
    PUBLIC_STATIC_ROUTES
} from '../js/services/sitemap-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');

async function main() {
    console.log('🚀 Generating XML Sitemap and robots.txt...');
    console.log(`🌐 Production Domain: ${PRODUCTION_DOMAIN}`);

    // Ensure public/ directory exists
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    const sitemapRootPath = path.join(rootDir, 'sitemap.xml');
    const sitemapPublicPath = path.join(publicDir, 'sitemap.xml');
    const robotsRootPath = path.join(rootDir, 'robots.txt');
    const robotsPublicPath = path.join(publicDir, 'robots.txt');

    try {
        // 1. Fetch eligible public listings from Supabase with a 5s timeout
        console.log('📡 Querying public listings from Supabase...');
        
        const fetchPromise = supabase
            .from('listings')
            .select('id, created_at, status');

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase request timed out after 5000ms')), 5000)
        );

        const { data: listings, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
            throw error;
        }

        const rawListings = listings || [];
        const eligibleListings = rawListings.filter(isListingEligibleForSitemap);
        console.log(`📊 Found ${rawListings.length} total listings in database:`);
        console.log(`   • ${eligibleListings.length} eligible public listings (Active / Sold Out)`);
        console.log(`   • ${rawListings.length - eligibleListings.length} private/pending listings (excluded)`);

        // 2. Generate Sitemap XML
        const sitemapXml = generateSitemapXml(eligibleListings, PRODUCTION_DOMAIN);
        const totalUrls = PUBLIC_STATIC_ROUTES.length + eligibleListings.length;
        console.log(`📄 Generated XML sitemap with ${totalUrls} total URLs.`);

        // 3. Generate robots.txt
        const robotsTxt = generateRobotsTxt(PRODUCTION_DOMAIN);

        // 4. Write files
        fs.writeFileSync(sitemapRootPath, sitemapXml, 'utf8');
        fs.writeFileSync(sitemapPublicPath, sitemapXml, 'utf8');
        fs.writeFileSync(robotsRootPath, robotsTxt, 'utf8');
        fs.writeFileSync(robotsPublicPath, robotsTxt, 'utf8');

        console.log(`✅ Saved: ${sitemapRootPath}`);
        console.log(`✅ Saved: ${sitemapPublicPath}`);
        console.log(`✅ Saved: ${robotsRootPath}`);
        console.log(`✅ Saved: ${robotsPublicPath}`);
        console.log('🎉 Sitemap and robots.txt generated successfully!\n');
    } catch (err) {
        console.warn('⚠️ Supabase dynamic query during build encountered an issue:', err.message || err);
        // If sitemap.xml already exists from a previous generation, preserve it safely without failing the build
        if (fs.existsSync(sitemapPublicPath) && fs.existsSync(robotsPublicPath)) {
            console.log('ℹ️ Using existing verified sitemap.xml and robots.txt in public/ directory.');
        } else {
            // If no verified sitemap exists, re-throw
            throw err;
        }
    }
}

main().catch(err => {
    console.error('💥 Fatal error in sitemap generation:', err);
    process.exit(1);
});
