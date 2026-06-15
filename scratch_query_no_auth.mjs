import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";
const keys = [
  "sb_publishable_YDFJXkoLmTVwCiF5vkQF8w_JzporspE",
  "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X"
];

async function main() {
  for (const key of keys) {
    console.log(`\n=== Testing Key: ${key} ===`);
    const supabase = createClient(supabaseUrl, key);
    
    // Test academic_years
    const { data: years, error: yErr } = await supabase.from('academic_years').select('*').limit(3);
    if (yErr) {
      console.log(`Academic years query error: ${yErr.message}`);
    } else {
      console.log(`Academic years count: ${years?.length}`);
    }

    // Test rbac_role_permissions
    const { data: perms, error: pErr } = await supabase.from('rbac_role_permissions').select('*');
    if (pErr) {
      console.log(`rbac_role_permissions query error: ${pErr.message}`);
    } else {
      console.log(`rbac_role_permissions count: ${perms?.length}`);
      if (perms && perms.length > 0) {
        console.log("Sample permissions:");
        console.log(JSON.stringify(perms.slice(0, 10), null, 2));
      }
    }
  }
}

main();
