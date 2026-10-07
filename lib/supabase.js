import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xjpqxhbuuevaplvthvsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcHF4aGJ1dWV2YXBsdnRodnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjI4MDYsImV4cCI6MjA5NDUzODgwNn0.OUt6r65O0Lw4GwgO2Vc8r6dlBgDqtNpzaQaXQ0cElOk';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL) || SUPABASE_URL;
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY) || SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
