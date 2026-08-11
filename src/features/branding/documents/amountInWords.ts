// ──────────────────────────────────────────────────────────────────────────────
// AMOUNT → WORDS (Indian numbering, INR)
//
// Extracted verbatim from SalarySlip.tsx and FeeReceiptDialog.tsx, which held
// byte-identical copies of these 34 lines. Two copies of a number-to-words
// routine is two places for a rounding bug to be fixed in only one of them —
// on a payslip and a receipt, where the words are the legally meaningful part.
//
// Behaviour is unchanged from both originals. This is a move, not a rewrite:
// existing documents produce exactly the same string.
// ──────────────────────────────────────────────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;

const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? ONES[h] + " Hundred" : ""}${h && r ? " " : ""}${r ? twoDigits(r) : ""}`;
};

/**
 * Indian numbering: crore / lakh / thousand, not million / billion.
 *
 * Paise are rendered only when non-zero, so a whole-rupee amount reads
 * "Five Thousand Rupees Only" rather than "… and Zero Paise Only".
 */
export const amountInWords = (value: number): string => {
  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  let words = parts.join(" ").trim() + " Rupees";
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
};
