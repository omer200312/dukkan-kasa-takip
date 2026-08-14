import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://metbslxdvvnqojrelkfn.supabase.co'
const supabasePublishableKey = 'sb_publishable_BD580x0ix6K0f_pL7dhneA_7HvTeDwE'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
