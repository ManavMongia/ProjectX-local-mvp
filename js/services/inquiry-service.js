/**
 * Inquiry Service
 * Pure data operations for customer/buyer inquiries.
 * Zero DOM dependencies.
 */

import { supabase } from '../core/supabase-client.js';

export async function getInquiries(brokerId = null) {
    let query = supabase.from('inquiries').select('*').order('created_at', { ascending: false });
    if (brokerId) {
        query = query.eq('broker_id', brokerId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('Error fetching inquiries:', error);
        return [];
    }
    return data || [];
}

export async function getInquiryById(id) {
    if (!id) return null;
    const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching inquiry:', error);
        return null;
    }
    return data;
}

export async function createInquiry(inquiryData) {
    const { data, error } = await supabase
        .from('inquiries')
        .insert([inquiryData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function replyToInquiry(id, reply) {
    const { data, error } = await supabase
        .from('inquiries')
        .update({ broker_reply: reply, read: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function markInquiryRead(id) {
    const { data, error } = await supabase
        .from('inquiries')
        .update({ read: true })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
