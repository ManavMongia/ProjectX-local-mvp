/**
 * Test: Availability Labels (getAvailabilityLabel / renderAvailabilityBadge)
 * Run with: node --experimental-vm-modules scripts/test_availability_labels.js
 *         or: node scripts/test_availability_labels.js  (Node 18+ with type:module)
 */

import { getAvailabilityLabel, renderAvailabilityBadge } from '../js/services/listing-service.js';

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

function todayStr() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

console.log('\n── Test: getAvailabilityLabel ──\n');

assert('today → "Available Immediately"',
    getAvailabilityLabel({ available_from: todayStr(), status: 'Active' }) === 'Available Immediately');

assert('past date → "Available Immediately"',
    getAvailabilityLabel({ available_from: '2020-01-01', status: 'Active' }) === 'Available Immediately');

const futureDate = offsetDate(30);
const label = getAvailabilityLabel({ available_from: futureDate, status: 'Active' });
assert('future date → starts with "Available From"',
    typeof label === 'string' && label.startsWith('Available From'));

const [fy, fm, fd] = futureDate.split('-');
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const expectedLabel = `Available From ${parseInt(fd, 10)} ${months[parseInt(fm, 10) - 1]} ${fy}`;
assert(`future date label is "${expectedLabel}"`, label === expectedLabel);

assert('null available_from → null',
    getAvailabilityLabel({ available_from: null, status: 'Active' }) === null);
assert('empty available_from → null',
    getAvailabilityLabel({ available_from: '', status: 'Active' }) === null);
assert('undefined available_from → null',
    getAvailabilityLabel({ status: 'Active' }) === null);

assert('sold_out → null (precedence)',
    getAvailabilityLabel({ available_from: todayStr(), status: 'sold_out' }) === null);
assert('"Sold Out" → null (precedence)',
    getAvailabilityLabel({ available_from: todayStr(), status: 'Sold Out' }) === null);
assert('"sold" → null (legacy)',
    getAvailabilityLabel({ available_from: todayStr(), status: 'sold' }) === null);
assert('null listing → null',
    getAvailabilityLabel(null) === null);

console.log('\n── Test: renderAvailabilityBadge ──\n');

assert('sold_out listing → empty string badge',
    renderAvailabilityBadge({ available_from: todayStr(), status: 'sold_out' }) === '');
assert('null available_from → empty string badge',
    renderAvailabilityBadge({ available_from: null, status: 'Active' }) === '');

const immediateBadge = renderAvailabilityBadge({ available_from: todayStr(), status: 'Active' });
assert('immediate badge contains "bg-emerald-600"', immediateBadge.includes('bg-emerald-600'));
assert('immediate badge contains "check_circle" icon', immediateBadge.includes('check_circle'));
assert('immediate badge contains "Available Immediately" text', immediateBadge.includes('Available Immediately'));

const futureBadge = renderAvailabilityBadge({ available_from: offsetDate(10), status: 'Active' });
assert('future badge contains "bg-indigo-600"', futureBadge.includes('bg-indigo-600'));
assert('future badge contains "event_available" icon', futureBadge.includes('event_available'));
assert('future badge contains "Available From" text', futureBadge.includes('Available From'));

assert(`YYYY-MM-DD today (${todayStr()}) yields "Available Immediately" (timezone-safe)`,
    getAvailabilityLabel({ available_from: todayStr(), status: 'Active' }) === 'Available Immediately');

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
if (failed > 0) process.exit(1);
