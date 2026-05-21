import { createClient } from '@supabase/supabase-js';

// .env faylidagi Vite muhit o'zgaruvchilarini o'qiymiz
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);