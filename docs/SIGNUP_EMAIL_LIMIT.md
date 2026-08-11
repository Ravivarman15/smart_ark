# "email rate limit exceeded" on signup — cause and permanent fix

## What happened

Signup fails with `email rate limit exceeded` for **every** address tried.
Changing the email does not help, because the limit has nothing to do with the
address.

Supabase's **built-in email service** is a shared SMTP relay intended for
development only. It is capped at a few messages **per hour for the whole
project**. Every signup triggers a confirmation email, so once the hourly budget
is spent, every subsequent signup is rejected until the window rolls over.

Confirmed against the live database: the failing address was **never created**.

```sql
select email, created_at from auth.users order by created_at desc limit 3;
--  phase8a.probe@thearktuition.com   2026-08-11 05:32
--  automation@thearktuition.com      2026-08-06 08:36
--  sunaina.123a@gmail.com            2026-07-31 09:40
```

`nivee2202@gmai.com` is absent — GoTrue rejected the request before creating the
user, so there are **no orphaned accounts** to clean up. Re-trying that address
after the fix will work normally.

*(Note: the timestamps show a probe signup at 05:32 UTC, created during Phase 8A
isolation testing, inside the same rate-limit window as the failed attempts. It
consumed part of that hour's budget.)*

## The permanent fix — project SMTP

**This is a Supabase dashboard change and cannot be made from the codebase.**

Smart ARK already sends its transactional mail through **Brevo**
(`supabase/functions/_shared/brevo.ts`, secrets `BREVO_API_KEY` and
`SENDER_EMAIL`). Auth emails are sent by GoTrue, which is configured separately
and is still on the built-in relay. Pointing it at the same Brevo account raises
the ceiling from a handful per hour to Brevo's quota (300/day on the free tier)
and removes this failure class permanently.

### Steps

1. Supabase Dashboard → **Authentication → Emails → SMTP Settings**
2. Enable **Custom SMTP** and enter:

   | Field | Value |
   |---|---|
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Username | your Brevo SMTP login (Brevo → SMTP & API → SMTP) |
   | Password | your Brevo **SMTP key** — *not* the API key used by the edge functions |
   | Sender email | the address already in the `SENDER_EMAIL` secret |
   | Sender name | `Smart ARK` |

3. The sender domain must be **verified in Brevo**, or Brevo will accept the
   message and drop it. Brevo → Senders & Domains.
4. Supabase Dashboard → **Authentication → Rate Limits** → raise
   *"Emails sent per hour"* from the default to something matching real signup
   volume (60 is generous for early stage).
5. Test with a real address at `/signup`.

### Why not remove the confirmation email instead

Disabling email confirmation would make signup instant and the error would
disappear — but verification is what stops scripted mass-provisioning with
throwaway addresses, and the wizard deliberately places it *before* organization
provisioning for that reason (see the header comment in `SignupPage.tsx`).
Turning it off trades a configuration problem for an abuse problem.

## What changed in the code

Nothing about the signup flow itself — it was behaving correctly. The raw GoTrue
string was being shown verbatim, which reads as "your email was rejected" and
sends people off trying address after address, none of which can work.

`signupErrorMessage()` in `SignupPage.tsx` now translates it:

> We could not send the confirmation email just now — our email service hit its
> hourly limit. This is on our side, not your address, so trying a different
> email will not help. Please wait about an hour and try again, or contact us and
> we will set your account up directly.

Unrecognised errors still show GoTrue's original text rather than a friendlier
guess that might be wrong.

## Until SMTP is configured

The limit resets roughly hourly, so signup works in bursts. To onboard a customer
immediately, create the account from the platform control plane instead of
asking them to self-serve.
