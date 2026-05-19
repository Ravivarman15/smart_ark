// Display formatters. Keep these here so every component uses the
// same locale + currency representation.

export const formatINR = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
};

export const formatINRDecimal = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatPaymentDate = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
