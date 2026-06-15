import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";

const keys = [
  "sb_publishable_YDFJXkoLmTVwCiF5vkQF8w_JzporspE",
  "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X"
];

async function tryWithKey(key) {
  console.log(`\n=== Testing key: ${key} ===`);
  const supabase = createClient(supabaseUrl, key);
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "management@ark.edu",
    password: "management123"
  });
  
  if (authError) {
    console.error(`Login failed with key ${key}:`, authError.message);
    return;
  }
  
  console.log(`Login successful! User ID: ${authData.user.id}`);
  
  // Query all coordinator permissions
  const { data: perms, error: permError } = await supabase
    .from('rbac_role_permissions')
    .select('*')
    .eq('role', 'coordinator');
    
  if (permError) {
    console.error("Error fetching permissions:", permError.message);
  } else {
    console.log(`Permissions count for coordinator: ${perms.length}`);
    console.log(JSON.stringify(perms, null, 2));
  }
}

async function main() {
  for (const key of keys) {
    await tryWithKey(key);
  }
}

main();
