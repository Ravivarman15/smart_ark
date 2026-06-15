import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";

const keys = [
  "sb_publishable_YDFJXkoLmTVwCiF5vkQF8w_JzporspE",
  "sb_publishable_CTUrXQBbNl7BXrpKoZWLmw_G1agot-X"
];

const credentials = [
  { email: "management@ark.edu", password: "management123" },
  { email: "akbar25cool@gmail.com", password: "Ark@2026" },
  { email: "aswinjeni@gmail.com", password: "Ark@2026" },
  { email: "arunantony.sc@gmail.com", password: "Ark@2026" },
  { email: "sivasankari3456@gmail.com", password: "Ark@2026" },
  { email: "kisshorekaran2707@gmail.com", password: "Ark@2026" },
  { email: "sathicksafrin7@gmail.com", password: "Ark@2026" },
  { email: "rvijaya91@gmail.com", password: "Ark@2026" },
  { email: "christosuna2102@gmail.com", password: "Ark@2026" },
  { email: "archanagovindaraj0316@gmail.com", password: "Ark@2026" }
];

async function main() {
  for (const key of keys) {
    console.log(`\n=== Testing Key: ${key} ===`);
    const supabase = createClient(supabaseUrl, key);
    for (const cred of credentials) {
      const { data, error } = await supabase.auth.signInWithPassword(cred);
      if (!error && data.user) {
        console.log(`[SUCCESS] Email: ${cred.email} with Key: ${key}`);
        
        // Fetch profiles to confirm role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', data.user.id)
          .maybeSingle();
        console.log(`  Role: ${profile?.role}`);
        
        // Try reading rbac_role_permissions
        const { data: perms, error: pErr } = await supabase
          .from('rbac_role_permissions')
          .select('*')
          .eq('role', 'coordinator');
        if (pErr) {
          console.error(`  Error reading role perms: ${pErr.message}`);
        } else {
          console.log(`  rbac_role_permissions for coordinator count: ${perms.length}`);
          console.log(JSON.stringify(perms, null, 2));
        }
      } else {
        console.log(`[FAILED] Email: ${cred.email} - ${error?.message}`);
      }
    }
  }
}

main();
