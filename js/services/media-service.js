/**
 * Media Service
 * Pure data operations for property listing media uploads and Supabase storage interactions.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

export const MEDIA_PLACEHOLDER = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80';

export async function uploadListingMediaFile(file, listingIdHint) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
        throw new Error(`Unsupported file type: ${file.name}`);
    }

    const folderName = listingIdHint ? `listing-media/${listingIdHint}` : `listing-media/temp-${Date.now()}`;
    const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${folderName}/${Date.now()}-${safeBase}`;

    const { error: upErr } = await supabase.storage
        .from('properties')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('properties').getPublicUrl(filePath);

    return {
        url: publicUrl,
        media_type: isImage ? 'image' : 'video',
        alt_text: file.name
    };
}

export async function getListingMedia(listingId) {
    if (!listingId) return [];
    const { data, error } = await supabase
        .from('listing_media')
        .select('*')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('Error fetching listing media:', error);
        return [];
    }
    return data || [];
}

export async function saveListingMediaRows(listingId, brokerId, mediaList) {
    if (!listingId) return;

    // Delete existing
    await supabase.from('listing_media').delete().eq('listing_id', listingId);

    if (!mediaList || mediaList.length === 0) return;

    const rows = mediaList.map((item, idx) => ({
        listing_id: listingId,
        broker_id: brokerId,
        media_type: item.media_type,
        url: item.url,
        thumbnail_url: item.thumbnail_url || null,
        sort_order: idx,
        is_cover: item.is_cover || false,
        alt_text: item.alt_text || null
    }));

    const { error } = await supabase.from('listing_media').insert(rows);
    if (error) {
        console.error('Error saving listing_media:', error.message);
        throw error;
    }
}
