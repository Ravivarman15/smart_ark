import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";
const supabaseKey = "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X";
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: "management@ark.edu",
        password: "management123"
    });
    
    if (authError) {
        console.error("Login failed:", authError);
    }
    
    console.log("Fetching profiles...");
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) {
        console.error("Error fetching profiles:", error);
    } else {
        console.log("Profiles:");
        console.log(data);
    }
}

main();
