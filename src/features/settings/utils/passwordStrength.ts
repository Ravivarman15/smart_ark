// Lightweight password strength estimator. NOT a security audit — just a
// nudge for users towards better passwords. Real entropy work is done by
// the auth provider on submit.
//
// Score:
//   0 — empty
//   1 — very weak (short or all-one-class)
//   2 — weak (meets some classes)
//   3 — okay (8+ chars, 3 classes)
//   4 — strong (12+ chars, 4 classes, no common patterns)

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

const COMMON = new Set([
  "password",
  "passw0rd",
  "p@ssw0rd",
  "qwerty",
  "asdfghjkl",
  "12345678",
  "abcdefgh",
  "letmein",
  "welcome1",
  "admin123",
  "ark@1234",
]);

export interface PasswordStrength {
  score: PasswordScore;
  label: "empty" | "very weak" | "weak" | "okay" | "strong";
  hints: string[];
}

export const estimatePassword = (raw: string): PasswordStrength => {
  if (!raw) return { score: 0, label: "empty", hints: ["Enter a password"] };

  const hints: string[] = [];
  const classes = [
    /[a-z]/.test(raw),
    /[A-Z]/.test(raw),
    /[0-9]/.test(raw),
    /[^A-Za-z0-9]/.test(raw),
  ].filter(Boolean).length;

  if (raw.length < 8) hints.push("Add more characters (8+ recommended)");
  if (!/[a-z]/.test(raw)) hints.push("Add a lowercase letter");
  if (!/[A-Z]/.test(raw)) hints.push("Add an uppercase letter");
  if (!/[0-9]/.test(raw)) hints.push("Add a digit");
  if (!/[^A-Za-z0-9]/.test(raw)) hints.push("Add a symbol");
  if (COMMON.has(raw.toLowerCase())) hints.push("Avoid common passwords");

  let score: PasswordScore;
  if (raw.length < 6) score = 1;
  else if (classes <= 2) score = 2;
  else if (raw.length < 12) score = 3;
  else if (COMMON.has(raw.toLowerCase())) score = 2;
  else score = 4;

  const label = (
    ["empty", "very weak", "weak", "okay", "strong"] as const
  )[score];

  return { score, label, hints };
};
