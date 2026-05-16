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

    // Update batch name
    const { data: bData, error: bError } = await supabase
        .from('batches')
        .update({ name: '10th CBSE' })
        .eq('name', "Archana's Batch")
        .select();
    
    if (bError) console.error("Batch update error:", bError);
    else console.log("Batch renamed to 10th CBSE", bData);

    // Update subject for Archana
    const { data: pData, error: pError } = await supabase
        .from('profiles')
        .update({ subject: 'Social Studies' })
        .eq('name', 'Ms. Archana')
        .select();
        
    if (pError) console.error("Profile update error:", pError);
    else console.log("Profile subject updated to Social Studies", pData);
}

main();
