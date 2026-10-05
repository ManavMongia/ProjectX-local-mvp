/**
 * Moderation Service
 * Pure data operations for reports, status histories, and profanity detection.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

const leetMap = {
    'a': '[a@44*]',
    'b': '[b8*]',
    'c': '[c(k*]',
    'd': '[d*]',
    'e': '[e3*]',
    'f': '[f*]',
    'g': '[g9*]',
    'h': '[h*]',
    'i': '[i1!*|]',
    'j': '[j*]',
    'k': '[k*]',
    'l': '[l1|*]',
    'm': '[m*]',
    'n': '[n*]',
    'o': '[o0*]',
    'p': '[p*]',
    'q': '[q*]',
    'r': '[r*]',
    'z': '[z*]',
    's': '[s$5*]',
    't': '[t7*]',
    'u': '[uv*]',
    'v': '[v*]',
    'w': '[w*]',
    'x': '[x*]',
    'y': '[y*]'
};

function makePattern(word, boundaryStart = false, boundaryEnd = false, notPrecededByS = false) {
    const parts = [];
    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const pattern = leetMap[char] || char;
        parts.push(pattern);
    }
    const separator = '[@*#%!$_\\-\\s.\\d]*';
    let innerPattern = parts.join(separator);
    
    if (notPrecededByS) {
        innerPattern = '(?<![sS])' + innerPattern;
    }
    
    let patternStr = innerPattern;
    if (boundaryStart) patternStr = '\\b' + patternStr;
    if (boundaryEnd) patternStr = patternStr + '\\b';
    
    return new RegExp(patternStr, 'i');
}

const substringWords = [
    'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'faggot', 'bastard', 'chink', 'retard',
    'asshole', 'badass', 'dumbass', 'jackass'
];

const standaloneWords = [
    'ass', 'asses', 'dick', 'dicks'
];

const patterns = [
    ...substringWords.map(w => makePattern(w, false, false, w === 'nigger')),
    makePattern('nigger', false, false, true),
    ...standaloneWords.map(w => makePattern(w, true, true))
];

export function hasProfanity(text) {
    if (!text) return false;
    const lowerText = String(text).toLowerCase();
    return patterns.some(regex => regex.test(lowerText));
}

export async function submitReport({ reporterId, targetType, targetId, reason, description }) {
    const { data, error } = await supabase
        .from('reports')
        .insert([{
            reporter_id: reporterId,
            target_type: targetType,
            target_id: targetId,
            reason: reason,
            description: description
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getListingStatusHistory(listingId) {
    const { data, error } = await supabase
        .from('listing_status_history')
        .select('*, profiles(full_name, role)')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load moderation history:', error);
        return [];
    }
    return data || [];
}
