// Public surface of the Payroll feature.
// Outer code imports from "@/features/payroll" — never reaches into subfolders.
// (Route-level pages are lazy-imported directly in App.tsx, like Finance.)

export * from "./types/payroll.types";
export * from "./utils/payrollCalc";
export * from "./schemas/payroll.schema";
export * from "./services";
export * from "./hooks";
export * from "./components";
export { PayrollRealtimeProvider } from "./providers/PayrollRealtimeProvider";
