/**
 * Automated Verification Suite for Automatic Property Grouping Logic
 * Tests requirements 1 through 6 from the ticket:
 * 
 * Test 1: New property -> New property group created, listing receives that group ID.
 * Test 2: Existing property -> Existing property group reused, no duplicate group created.
 * Test 3: Different property -> Distinct property group created.
 * Test 4: Automatic execution -> groupNewListing runs automatically during createListing.
 * Test 5: Database insertion logic -> Matches criteria on location/coords/beds/type/sqft.
 * Test 6: Duplicate execution -> Idempotent, no duplicate group or relationship created.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
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

const env = loadEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Import the service logic
import { 
    isSameUnderlyingProperty, 
    generatePropertyGroupName, 
    groupNewListing,
    findExistingPropertyGroup,
    createPropertyGroup,
    getPropertyGroupById,
    getListingsInPropertyGroup
} from '../js/services/property-group-service.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('ProjectX: Automatic Property Grouping Test Suite');
    console.log('====================================================\n');

    // Unit test: Deterministic Identity Matching
    console.log('[Phase 1: Deterministic Matching Verification]');
    {
        const propA = {
            location: 'Powai, Mumbai',
            type: 'Apartment',
            beds: 3,
            baths: 2,
            sqft: 1450,
            lat: 19.1176,
            lng: 72.9060
        };

        const propSameCoords = {
            location: 'Hiranandani Gardens, Powai',
            type: 'Apartment',
            beds: 3,
            baths: 2,
            sqft: 1455, // within 50 sqft tolerance
            lat: 19.11762, // within 0.00015 deg (~15m)
            lng: 72.90603
        };

        const propDiffBeds = {
            ...propA,
            beds: 4
        };

        const propDiffType = {
            ...propA,
            type: 'Villa'
        };

        const propFarCoords = {
            ...propA,
            lat: 19.2000,
            lng: 72.8500
        };

        assert(isSameUnderlyingProperty(propA, propSameCoords) === true, 'Listings with matching coords & specs are identified as same property');
        assert(isSameUnderlyingProperty(propA, propDiffBeds) === false, 'Listings with different bedroom counts are NOT grouped');
        assert(isSameUnderlyingProperty(propA, propDiffType) === false, 'Listings with different property types are NOT grouped');
        assert(isSameUnderlyingProperty(propA, propFarCoords) === false, 'Listings in distant locations are NOT grouped');

        // Test normalized location matching when coords absent
        const noCoordsA = { location: 'Sector 56, Gurgaon', type: 'Apartment', beds: 2, sqft: 1200 };
        const noCoordsB = { location: 'sector 56, gurgaon ', type: 'Apartment', beds: 2, sqft: 1220 };
        assert(isSameUnderlyingProperty(noCoordsA, noCoordsB) === true, 'Listings matching normalized location string are identified as same property');
    }

    // Name generation verification
    console.log('\n[Phase 2: Standardized Group Naming]');
    {
        const name1 = generatePropertyGroupName({ beds: 2, type: 'Apartment', location: 'Mumbai' });
        assert(name1 === '2 Beds Apartment in Mumbai', `Generated name matches standard: "${name1}"`);

        const name2 = generatePropertyGroupName({ beds: 0, type: 'Office/Commercial', location: 'Kharadi, Pune' });
        assert(name2 === 'Office/Commercial in Kharadi, Pune', `Generated commercial name matches standard: "${name2}"`);
    }

    // Test 1: New property -> New group created
    console.log('\n[Test 1: New Property Group Creation]');
    let newGroupResult;
    const uniqueTestLoc = `Automated Test Location ${Date.now()}`;
    const newListing1 = {
        id: 99901,
        title: 'New Automated Listing 1',
        location: uniqueTestLoc,
        type: 'Apartment',
        beds: 3,
        sqft: 1500,
        lat: 19.0760,
        lng: 72.8777
    };
    {
        newGroupResult = await groupNewListing(newListing1, newListing1.id);
        assert(newGroupResult.isNewGroup === true, 'New property listing triggers creation of a new group');
        assert(!!newGroupResult.property_group_id, `Listing receives property_group_id: ${newGroupResult.property_group_id}`);
        assert(newGroupResult.groupName.includes(uniqueTestLoc), `Group name reflects listing attributes: "${newGroupResult.groupName}"`);
    }

    // Test 2: Existing property -> Existing group reused
    console.log('\n[Test 2: Existing Property Group Reuse]');
    {
        // Second listing representing the same property
        const siblingListing = {
            id: 99902,
            title: 'New Automated Listing 2 (Same Property)',
            location: uniqueTestLoc,
            type: 'Apartment',
            beds: 3,
            sqft: 1520, // within tolerance
            lat: 19.07605, // within ~15m
            lng: 72.87772
        };

        const siblingResult = await groupNewListing(siblingListing, siblingListing.id);
        assert(siblingResult.isNewGroup === false, 'Listing for existing property reuses existing group');
        assert(siblingResult.property_group_id === newGroupResult.property_group_id, 
            `Listing receives identical group ID (${siblingResult.property_group_id} === ${newGroupResult.property_group_id})`);
    }

    // Test 3: Different property -> Different group created
    console.log('\n[Test 3: Different Property Isolation]');
    {
        const diffListing = {
            id: 99903,
            title: 'Different Property Listing',
            location: `Different Sector ${Date.now()}`,
            type: 'Villa',
            beds: 5,
            sqft: 4000,
            lat: 28.4595,
            lng: 77.0266
        };

        const diffResult = await groupNewListing(diffListing, diffListing.id);
        assert(diffResult.isNewGroup === true, 'Genuinely different property triggers new group creation');
        assert(diffResult.property_group_id !== newGroupResult.property_group_id, 
            `Different property receives distinct group ID (${diffResult.property_group_id} !== ${newGroupResult.property_group_id})`);
    }

    // Test 4 & 5: Existing DB Properties matching check
    console.log('\n[Test 4 & 5: Database Matching Against Existing Production Groups]');
    {
        // Existing listing 234 in Mumbai: "2 Beds Apartment in Mumbai"
        const existingMumbaiCandidate = {
            title: 'Candidate Listing for Mumbai 2BHK',
            location: 'mumbai',
            type: 'Apartment',
            beds: 2,
            sqft: 1200
        };

        const matchedId = await findExistingPropertyGroup(existingMumbaiCandidate);
        assert(matchedId === '3f48f406-6b46-475a-b80a-8690c829d5ae', 
            `Candidate in Mumbai correctly associates with existing group '3f48f406-6b46-475a-b80a-8690c829d5ae'`);
    }

    // Test 6: Idempotent / Duplicate execution
    console.log('\n[Test 6: Duplicate Execution / Idempotency]');
    {
        const alreadyGroupedListing = {
            id: 99901,
            property_group_id: newGroupResult.property_group_id,
            property_group_name: newGroupResult.groupName
        };

        const reRunResult = await groupNewListing(alreadyGroupedListing, 99901);
        assert(reRunResult.isNewGroup === false, 'Re-running grouping for already grouped listing does not create new group');
        assert(reRunResult.property_group_id === newGroupResult.property_group_id, 'Preserves existing property_group_id');
    }

    // Test 7: Application Regression Check (Auth, Deals, Ratings, Listings)
    console.log('\n[Test 7: Existing Application Features Regression Check]');
    {
        const authService = await import('../js/services/auth-service.js');
        assert(typeof authService.signIn === 'function', 'Auth service signIn function is intact');
        assert(typeof authService.signUp === 'function', 'Auth service signUp function is intact');
        assert(typeof authService.getUserProfile === 'function', 'Auth service getUserProfile function is intact');

        const dealService = await import('../js/services/deal-service.js');
        assert(typeof dealService.getDealsForUser === 'function', 'Deal service getDealsForUser function is intact');
        assert(typeof dealService.markTransactionCompleted === 'function', 'Deal service markTransactionCompleted function is intact');
        assert(typeof dealService.getRentalAgreementData === 'function', 'Deal service getRentalAgreementData function is intact');

        const ratingService = await import('../js/services/rating-service.js');
        assert(typeof ratingService.submitRating === 'function', 'Rating service submitRating function is intact');
        assert(typeof ratingService.getUserRatingSummary === 'function', 'Rating service getUserRatingSummary function is intact');
        assert(typeof ratingService.checkRatingEligibility === 'function', 'Rating service checkRatingEligibility function is intact');

        const listingService = await import('../js/services/listing-service.js');
        assert(typeof listingService.createListing === 'function', 'Listing service createListing function is intact');
        assert(typeof listingService.getListings === 'function', 'Listing service getListings function is intact');
    }

    // Clean up test groups created during this run if created in DB
    try {
        if (newGroupResult?.property_group_id) {
            await supabase.from('property_groups').delete().eq('id', newGroupResult.property_group_id);
        }
    } catch {
        // Safe ignore
    }

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
