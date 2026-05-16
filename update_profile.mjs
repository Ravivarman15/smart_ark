import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";
const supabaseKey = "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Logging in...");
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: "management@ark.edu",
        password: "management123"
    });
    
    if (authError) {
        console.error("Login failed:", authError);
        return;
    }
    
    console.log("Login successful! User ID:", authData.user.id);
    
    console.log("Updating profile...");
    const { data, error } = await supabase
        .from('profiles')
        .update({ name: 'Augustine' })
        .eq('user_id', authData.user.id);
        
    if (error) {
        console.error("Update failed:", error);
    } else {
        console.log("Profile updated successfully!");
    }
}

main();
