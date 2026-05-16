import re

with open('src/contexts/AppDataContext.tsx', 'r') as f:
    content = f.read()

# Replace any: await supabase.from(...).update/insert/delete(...)
# That is NOT preceded by const { ... } = 

# First, let's fix `await supabase.from(` that are inside an async function
pattern = r'(\s+)await supabase\.from\((.*?)\)\.(update|insert|delete|upsert)\((.*?)\)(.*?);'

def repl(m):
    indent = m.group(1)
    table = m.group(2)
    action = m.group(3)
    args = m.group(4)
    rest = m.group(5)
    
    # If the previous text has `const {` on the same line, this regex might not match it if we are careful,
    # but the regex `\s+await` expects whitespace explicitly. 
    # Let's ensure it's exactly just `await ` with spaces/newlines before it, not `= await`.
    if "=" in m.group(0).split("await")[0]: 
        return m.group(0) # It's part of an assignment
        
    return f'{indent}const {{ error: supabaseErr }} = await supabase.from({table}).{action}({args}){rest};{indent}if (supabaseErr) {{ console.error(supabaseErr); toast.error("Database operation failed"); return; }}'

# Replaced with a generic error handler
new_content = re.sub(r'(\n\s+)await supabase\.from\((.*?)\)\.(update|insert|delete|upsert)\((.*?)\)(.*?);', repl, content)

with open('src/contexts/AppDataContext.tsx', 'w') as f:
    f.write(new_content)

print("Updates fixed.")
