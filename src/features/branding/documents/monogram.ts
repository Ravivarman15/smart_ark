/**
 * Initials for an organization with no logo.
 *
 * Lives in its own module rather than beside `OrgMark` so DocumentShell.tsx
 * exports components only — a mixed module breaks React Fast Refresh for every
 * component in it, which is a real developer-experience cost for the sake of
 * one helper.
 *
 * First letters of up to three words, so "ABC Academy" → "AA" and
 * "ARK Learning Arena" → "ALA". A single word contributes two letters, because
 * one initial in a 56px tile reads as a rendering glitch.
 *
 * Never returns empty: a blank tile looks like a broken image, whereas a bullet
 * reads as "no logo configured yet".
 */
export const monogramOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
};
