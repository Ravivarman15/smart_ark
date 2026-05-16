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

    const { data: campusData } = await supabase.from('campuses').select('*');
    const seniorCampus = campusData.find(c => c.name.includes('Senior'));

    console.log("Checking for Archana's Batch...");
    let { data: batches } = await supabase.from('batches').select('*').eq('name', "Archana's Batch");
    let batchId = null;

    if (!batches || batches.length === 0) {
        console.log("Creating Archana's Batch...");
        const { data: newBatch, error: batchError } = await supabase.from('batches').insert({
            name: "Archana's Batch",
            campus_id: seniorCampus.id,
            avg_marks: 0,
            portion_complete: 0,
            retest_rate: 0,
            health: 'moderate',
            teacher_responsible: 'Ms. Archana'
        }).select();
        if (batchError) console.error(batchError);
        batchId = newBatch[0].id;
    } else {
        batchId = batches[0].id;
    }

    const newStudents = [
        "Akarsh nixon",
        "S.Gokul",
        "S.Kanishka shree",
        "B.Sonakshi",
        "yogalakshmi",
        "K.Joshida",
        "D.Nithin",
        "Aashil ismath"
    ];

    console.log("Adding students...");
    for (const s of newStudents) {
        // check if student exists
        const { data: existing } = await supabase.from('students').select('*').eq('name', s);
        if (!existing || existing.length === 0) {
            await supabase.from('students').insert({
                name: s,
                batch_id: batchId,
                spi: 0,
                risk_level: 'safe',
                campus_id: seniorCampus.id,
                is_active: true
            });
            console.log("Added", s);
        } else {
            // Update to Archana's batch
            await supabase.from('students').update({
                batch_id: batchId,
                is_active: true
            }).eq('name', s);
            console.log("Updated", s);
        }
    }
    console.log("Done adding students in Supabase.");
}

main();
