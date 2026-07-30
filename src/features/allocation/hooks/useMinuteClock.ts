import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Minutes since midnight, re-rendered once a minute.
//
// Every class-lifecycle nudge — "12m late", "8m over", "attendance due in 4
// min" — is a function of the clock, not of the data. Without a tick the row
// renders once when the query resolves and then quietly stops being true.
//
// One hook rather than a setInterval per screen, so the whole app counts the
// same minutes and there is one place to change the cadence.
// ─────────────────────────────────────────────────────────────────────────────

const minutesNow = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const useMinuteClock = (): number => {
  const [now, setNow] = useState(minutesNow);
  useEffect(() => {
    // 20s, not 60s: a countdown that only refreshes on the minute can sit on
    // "attendance due in 1 min" for the best part of a minute after it expired.
    const t = setInterval(() => setNow(minutesNow()), 20_000);
    return () => clearInterval(t);
  }, []);
  return now;
};
