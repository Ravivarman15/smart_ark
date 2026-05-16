const fs = require('fs');

let content = fs.readFileSync('src/contexts/AppDataContext.tsx', 'utf8');

// Add toast import if missing
if (!content.includes('import { toast } from "sonner";')) {
  content = content.replace(
    'import { useAuth } from "@/contexts/AuthContext";',
    'import { useAuth } from "@/contexts/AuthContext";\nimport { toast } from "sonner";'
  );
}

// Fix the 3 override/violation mutations
content = content.replace(
  /const resolveViolation = useCallback\(async \(id: string\) => \{\n    await supabase.from\("violations"\).update\(\{ resolved: true \}\).eq\("id", id\);\n    setViolations\(prev => prev.map\(v => v.id === id \? \{ ...v, resolved: true \} : v\)\);\n  \}, \[\]\);/,
  `const resolveViolation = useCallback(async (id: string) => {
    const { error } = await supabase.from("violations").update({ resolved: true }).eq("id", id);
    if (error) { toast.error("Failed to resolve violation"); return; }
    setViolations(prev => prev.map(v => v.id === id ? { ...v, resolved: true } : v));
  }, []);`
);

content = content.replace(
  /const addOverrideRequest = useCallback\(async \(o: Omit<OverrideRequest, "id" \| "timestamp">\) => \{\n    const \{ data \} = await supabase.from\("override_log"\).insert\(\{\n([\s\S]*?)    \}\).select\(\).single\(\);\n\n    if \(data\) \{\n      setOverrideRequests\(prev => \[\{ ...o, id: data.id, timestamp: new Date\(\).toISOString\(\) \}, ...prev\]\);\n    \}\n  \}, \[user\]\);/,
  `const addOverrideRequest = useCallback(async (o: Omit<OverrideRequest, "id" | "timestamp">) => {
    const { data, error } = await supabase.from("override_log").insert({$1}).select().single();
    if (error) { toast.error("Failed to add override request"); return; }
    if (data) {
      setOverrideRequests(prev => [{ ...o, id: data.id, timestamp: new Date().toISOString() }, ...prev]);
    }
  }, [user]);`
);

content = content.replace(
  /const approveOverride = useCallback\(async \(id: string, approvedBy: string\) => \{\n    await supabase.from\("override_log"\).update\(\{\n      status: "approved",\n      approved_by: user\?.profileId,\n      approved_by_name: approvedBy,\n    \}\).eq\("id", id\);\n    setOverrideRequests\(prev => prev.map\(o => o.id === id \? \{ ...o, status: "approved" as const, approvedBy \} : o\)\);\n  \}, \[user\]\);/,
  `const approveOverride = useCallback(async (id: string, approvedBy: string) => {
    const { error } = await supabase.from("override_log").update({
      status: "approved",
      approved_by: user?.profileId,
      approved_by_name: approvedBy,
    }).eq("id", id);
    if (error) { toast.error("Failed to approve override"); return; }
    setOverrideRequests(prev => prev.map(o => o.id === id ? { ...o, status: "approved" as const, approvedBy } : o));
  }, [user]);`
);

content = content.replace(
  /const rejectOverride = useCallback\(async \(id: string\) => \{\n    await supabase.from\("override_log"\).update\(\{ status: "rejected" \}\).eq\("id", id\);\n    setOverrideRequests\(prev => prev.map\(o => o.id === id \? \{ ...o, status: "rejected" as const \} : o\)\);\n  \}, \[\]\);/,
  `const rejectOverride = useCallback(async (id: string) => {
    const { error } = await supabase.from("override_log").update({ status: "rejected" }).eq("id", id);
    if (error) { toast.error("Failed to reject override"); return; }
    setOverrideRequests(prev => prev.map(o => o.id === id ? { ...o, status: "rejected" as const } : o));
  }, []);`
);

fs.writeFileSync('src/contexts/AppDataContext.tsx', content);
console.log('Fixed specific mutations.');
