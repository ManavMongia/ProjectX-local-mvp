/**
 * Optional Standalone Backfill Script for Property Groups
 * 
 * IMPORTANT:
 * As specified in Ticket Section 8, this script is OPTIONAL and must NOT be executed
 * automatically against production data.
 * 
 * Purpose:
 * Scans existing listings where property_group_id IS NULL, evaluates them using
 * the same deterministic matching criteria (location / coordinates + type + beds + sqft),
 * and groups them under common or new property_groups.
 * 
 * Usage:
 *   Dry run (preview changes without writing):
 *     node scripts/backfill_property_groups.js --dry-run
 * 
 *   Live execution (applies changes to database):
 *     node scripts/backfill_property_groups.js --execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load environment variables from .env
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env file not found at ' + envPath);
    }
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            env[key] = val;
        }
    }
    return env;
}

// 2. Deterministic Matching Function
function isSameUnderlyingProperty(a, b) {
    if (!a || !b) return false;

    let locationMatches = false;
    const hasCoordsA = a.lat != null && a.lng != null && Number(a.lat) !== 0 && Number(a.lng) !== 0;
    const hasCoordsB = b.lat != null && b.lng != null && Number(b.lat) !== 0 && Number(b.lng) !== 0;

    if (hasCoordsA && hasCoordsB) {
        const latDiff = Math.abs(Number(a.lat) - Number(b.lat));
        const lngDiff = Math.abs(Number(a.lng) - Number(b.lng));
        if (latDiff < 0.00015 && lngDiff < 0.00015) {
            locationMatches = true;
        }
    }

    if (!locationMatches && a.location && b.location) {
        const locA = String(a.location).trim().toLowerCase();
        const locB = String(b.location).trim().toLowerCase();
        if (locA === locB && locA.length > 0) {
            locationMatches = true;
        }
    }

    if (!locationMatches) return false;

    if (a.type && b.type) {
        if (String(a.type).trim().toLowerCase() !== String(b.type).trim().toLowerCase()) return false;
    }

    if (a.beds != null && b.beds != null) {
        if (Number(a.beds) !== Number(b.beds)) return false;
    }

    if (a.sqft != null && b.sqft != null && Number(a.sqft) > 0 && Number(b.sqft) > 0) {
        if (Math.abs(Number(a.sqft) - Number(b.sqft)) > 50) return false;
    }

    return true;
}

function generateGroupName(l) {
    const beds = l.beds && Number(l.beds) > 0 ? `${l.beds} Beds ` : '';
    const type = (l.type || 'Property').trim();
    const loc = (l.location || '').trim();
    return `${beds}${type}${loc ? ' in ' + loc : ''}`.trim() || l.title || 'Property Group';
}

async function main() {
    const args = process.argv.slice(2);
    const isExecute = args.includes('--execute');
    const isDryRun = args.includes('--dry-run') || !isExecute;

    console.log('====================================================');
    console.log('ProjectX: Property Group Backfill Utility');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulating only, no writes)' : 'EXECUTE (Writing to DB)'}`);
    console.log('====================================================\n');

    const env = loadEnv();
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

    // Fetch existing groups
    const { data: groups, error: gErr } = await supabase.from('property_groups').select('*');
    if (gErr) throw gErr;
    console.log(`Found ${groups ? groups.length : 0} existing property groups in database.`);

    // Fetch all listings
    const { data: listings, error: lErr } = await supabase.from('listings').select('*').order('created_at', { ascending: true });
    if (lErr) throw lErr;
    console.log(`Found ${listings ? listings.length : 0} total listings.`);

    const unassigned = (listings || []).filter(l => !l.property_group_id);
    const assigned = (listings || []).filter(l => !!l.property_group_id);
    console.log(`- Already assigned: ${assigned.length}`);
    console.log(`- Pending backfill: ${unassigned.length}\n`);

    if (unassigned.length === 0) {
        console.log('All listings already have a property_group_id. Nothing to backfill.');
        return;
    }

    const proposedGroups = [...(groups || [])];
    const proposedAssignments = [];

    for (const listing of unassigned) {
        // Find existing match in assigned or in previously processed
        let matchedGroupId = null;

        // Check against listings already in groups
        for (const candidate of assigned) {
            if (isSameUnderlyingProperty(listing, candidate)) {
                matchedGroupId = candidate.property_group_id;
                break;
            }
        }

        // If not matched, check against already proposed listings
        if (!matchedGroupId) {
            for (const prev of proposedAssignments) {
                if (isSameUnderlyingProperty(listing, prev.listing)) {
                    matchedGroupId = prev.property_group_id;
                    break;
                }
            }
        }

        if (matchedGroupId) {
            proposedAssignments.push({
                listing,
                property_group_id: matchedGroupId,
                isNewGroup: false
            });
            console.log(`[REUSE] Listing #${listing.id} ("${listing.title}") -> Group ${matchedGroupId}`);
        } else {
            const newGroupId = crypto.randomUUID();
            const groupName = generateGroupName(listing);
            proposedGroups.push({ id: newGroupId, name: groupName });
            proposedAssignments.push({
                listing,
                property_group_id: newGroupId,
                isNewGroup: true,
                groupName
            });
            console.log(`[NEW] Listing #${listing.id} ("${listing.title}") -> New Group: "${groupName}" (${newGroupId})`);
        }
    }

    console.log(`\nSummary:`);
    console.log(`- Listings to assign to existing groups: ${proposedAssignments.filter(p => !p.isNewGroup).length}`);
    console.log(`- New groups to create: ${proposedAssignments.filter(p => p.isNewGroup).length}`);

    if (isDryRun) {
        console.log('\n[DRY RUN COMPLETE] No modifications were written to the database.');
        console.log('To apply these changes, run with: node scripts/backfill_property_groups.js --execute');
        return;
    }

    // Execution phase
    console.log('\nApplying changes to database...');
    for (const item of proposedAssignments) {
        if (item.isNewGroup) {
            const { error: insErr } = await supabase.from('property_groups').insert([{
                id: item.property_group_id,
                name: item.groupName,
                created_at: new Date().toISOString()
            }]);
            if (insErr) {
                console.error(`Failed to create group ${item.property_group_id}:`, insErr.message);
                continue;
            }
        }

        const { error: updErr } = await supabase.from('listings').update({
            property_group_id: item.property_group_id
        }).eq('id', item.listing.id);

        if (updErr) {
            console.error(`Failed to assign listing #${item.listing.id}:`, updErr.message);
        } else {
            console.log(`Successfully assigned listing #${item.listing.id} to group ${item.property_group_id}`);
        }
    }

    console.log('\n[BACKFILL COMPLETE]');
}

main().catch(err => {
    console.error('Backfill error:', err);
    process.exit(1);
});
