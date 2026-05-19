// Attendance feature scaffold. See @/features/_template/PATTERN.ts.
//
// Domain covered: teacher check-in/out, admin check-in/out, student attendance.
// IMPORTANT: geo-fence validation MUST move from the client (AppDataContext
// `isNearCampus`) into a Supabase edge function before this migration ships.
// The frontend should only display the result of a server-side check.
export {};
