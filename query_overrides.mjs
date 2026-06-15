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
    
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'coordinator');
      
    if (profError) {
      console.error("Error fetching coordinator profiles:", profError.message);
    } else {
      console.log("Coordinator profiles:", JSON.stringify(profiles, null, 2));
    }
    
    const { data: overrides, error: overError } = await supabase
      .from('rbac_user_permission_overrides')
      .select('*');
      
    if (overError) {
      console.error("Error fetching user permission overrides:", overError.message);
    } else {
      console.log("User permission overrides:", JSON.stringify(overrides, null, 2));
    }
    
    const { data: rolePerms, error: roleError } = await supabase
      .from('rbac_role_permissions')
      .select('*')
      .eq('role', 'coordinator');
      
    if (roleError) {
      console.error("Error fetching coordinator role perms:", roleError.message);
    } else {
      console.log("Coordinator role permissions:", JSON.stringify(rolePerms, null, 2));
    }
  }
}

main();
