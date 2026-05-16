import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data, error } = await supabase.from('batches').select('*').limit(1)
console.log(data ? Object.keys(data[0]) : error)
