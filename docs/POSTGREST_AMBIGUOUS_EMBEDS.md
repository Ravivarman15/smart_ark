# Ambiguous PostgREST embeds

## The bug

A parent opened Documents and got:

> Could not embed because more than one relationship was found for
> `student_documents` and `students`

`student_documents` has **two** foreign keys to `students`:

```
student_documents_student_id_fkey      FOREIGN KEY (student_id)
                                       REFERENCES students(id)

student_documents_student_id_same_org  FOREIGN KEY (organization_id, student_id)
                                       REFERENCES students(organization_id, id)
```

The second is the composite tenant-integrity key the multi-tenancy work added —
it is what makes it impossible for a document row to point at a student in
another organization. It is worth keeping.

But PostgREST will not guess which relationship `students(name)` means. It
answers **HTTP 300, PGRST201**, and the query returns nothing at all.

## It was ten relationships, not one

That constraint was added to ten tables. Every one was confirmed broken against
the live database — the plain embed answered 300 in all ten cases:

| child | parent |
|---|---|
| `student_documents` | `students` |
| `student_attendance` | `students` |
| `student_fees` | `students` |
| `parent_student_links` | `students` |
| `exam_results` | `students` |
| `class_students` | `students` |
| `student_auth_accounts` | `students` |
| `staff_attendance` | `profiles` |
| `payroll_items` | `profiles` |
| `leave_requests` | `profiles` |

Documents was simply the first one anybody opened.

## The fix

Name the constraint, and alias the result so the JSON key does not move:

```ts
// before — 300 at runtime
"…, students(name)"

// after
"…, students:students!student_documents_student_id_fkey(name)"
```

The alias is not decoration. Existing code reads `row.students`, and stating the
alias means that stays true no matter how PostgREST would have derived the key.

`!inner` is a join **modifier**, not a constraint name — it disambiguates
nothing. Both go together when an inner join is wanted:

```ts
"students:students!student_attendance_student_id_fkey!inner(id, name)"
```

### One trap this fix removed

`authAccounts.service.ts` fell back from a RICH select to a BASE select when the
first failed. Both embedded `students(…)` unhinted, so **both failed for the
same reason** — the retry could never have succeeded. A fallback that cannot
change the outcome reads like resilience and provides none.

## The gate

`src/test/security/postgrestEmbeds.test.ts` fails the build on any embed across
a pair joined by more than one foreign key.

The pair list lives in `src/test/fixtures/ambiguousEmbeds.json` and is
**generated**, not curated — adding a second foreign key between two tables adds
a pair, and every embed across it must then name its constraint. The failure
message prints the file, the pair, and the surrounding source, and points at the
fixture for the constraint names.

This gate is the only thing that can see the problem before a user does: the bad
query type-checks, builds, and looks completely ordinary.

### Regenerating the fixture

Run against the linked project after any migration that adds a foreign key:

```sql
with fk as (
  select c.conrelid::regclass::text as child,
         c.confrelid::regclass::text as parent,
         c.conname
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where c.contype = 'f' and n.nspname = 'public'
)
select child, parent, count(*) as fks,
       string_agg(conname, ' | ' order by conname) as names
from fk
group by child, parent
having count(*) > 1
order by child, parent;
```

Write the rows into the fixture as `{ child, parent, constraints[] }`. The test
also pins the ten `_same_org` pairs by name, so a regeneration that silently
drops one fails rather than quietly narrowing what is watched.

### Verifying against the live API

An ambiguous embed is rejected at **parse** time, before RLS, so an anonymous
request is enough to tell a broken embed from an empty one:

```
curl -s -o /dev/null -w "%{http_code}" \
  "$VITE_SUPABASE_URL/rest/v1/student_documents?select=id,students(name)&limit=1" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```

`300` is the bug. `200 []` is a working query the caller has no rows for.
