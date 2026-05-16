import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";
const supabaseKey = "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { data, error } = await supabase.from("academic_years").insert({ name: "Test Year", is_active: false }).select();
  console.log("Academic Year Insert Result:", data, error);
  
  if (data && data.length > 0) {
     await supabase.from("academic_years").delete().eq("id", data[0].id);
  }
}

testInsert();
