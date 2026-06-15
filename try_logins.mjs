import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vxyshcucwdbpxrhddaeh.supabase.co";
const supabaseKey = "sb_publishable_YDFJXkoLmTVwCiF5vkQF8w_JzporspE";
const supabase = createClient(supabaseUrl, supabaseKey);

const credentials = [
  { email: "management@ark.edu", password: "management123" },
  { email: "management@ark.edu", password: "Ark@2026" },
  { email: "akbar25cool@gmail.com", password: "Ark@2026" },
  { email: "aswinjeni@gmail.com", password: "Ark@2026" },
];

async function main() {
  for (const cred of credentials) {
    console.log(`Trying ${cred.email} / ${cred.password}...`);
    const { data, error } = await supabase.auth.signInWithPassword(cred);
    if (!error && data.user) {
      console.log(`SUCCESS! Logged in as: ${cred.email}`);
      // Fetch rbac_role_permissions for coordinator
      const { data: perms, error: permError } = await supabase
        .from('rbac_role_permissions')
        .select('*')
        .eq('role', 'coordinator');
      if (permError) {
        console.error("Error reading rbac_role_permissions:", permError);
      } else {
        console.log("rbac_role_permissions for coordinator:");
        console.log(JSON.stringify(perms, null, 2));
      }
      return;
    } else {
      console.log(`Failed: ${error?.message}`);
    }
  }
}

main();
