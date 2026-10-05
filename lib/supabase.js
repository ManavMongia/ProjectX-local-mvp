import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url') {
    console.warn('Supabase credentials are not set in .env file. Please check your configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
