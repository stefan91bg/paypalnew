import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log(supabaseUrl,supabaseKey)
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL or Service Role Key environment variables.");
}

// Kreiramo klijenta sa service_role ključem koji ima puna ovlašćenja na serveru
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
});
