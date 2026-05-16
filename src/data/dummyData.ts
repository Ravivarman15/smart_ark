// Dummy data for ARK Institutional Intelligence System

export const campuses = ["Junior Campus", "Senior Campus", "Nestlings"];

// ── Real class timetable (15 sessions) ────────────────────────────────────────
export interface ClassScheduleEntry {
  batchLetter: string;   // A–O
  name: string;          // Full class name
  timing: string;        // "9:30 AM – 4:00 PM"
  capacity: number;      // Max students
  campus: string;
}

export const CLASS_SCHEDULE: ClassScheduleEntry[] = [
  { batchLetter: "A", name: "NEET Repeater (A)",          timing: "9:30 AM – 4:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "B", name: "NEET Repeater (C)",          timing: "9:30 AM – 4:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "C", name: "9th Std",                    timing: "4:00 PM – 6:00 PM",  capacity: 25, campus: "Junior Campus"  },
  { batchLetter: "D", name: "8th Std",                    timing: "4:00 PM – 6:00 PM",  capacity: 15, campus: "Junior Campus"  },
  { batchLetter: "E", name: "7th Std",                    timing: "4:30 PM – 6:30 PM",  capacity: 15, campus: "Junior Campus"  },
  { batchLetter: "F", name: "6th Std",                    timing: "4:30 PM – 6:30 PM",  capacity: 10, campus: "Junior Campus"  },
  { batchLetter: "G", name: "10th Std – SB",              timing: "5:00 PM – 7:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "H", name: "10th Std – CBSE",            timing: "5:00 PM – 7:00 PM",  capacity: 20, campus: "Senior Campus"  },
  { batchLetter: "I", name: "12th Std – SB",              timing: "6:00 PM – 8:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "J", name: "10th Std – ICSE",            timing: "6:00 PM – 8:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "K", name: "CBSE NEET & JEE Integrated", timing: "7:00 PM – 9:00 PM",  capacity: 25, campus: "Senior Campus"  },
  { batchLetter: "L", name: "Arts",                       timing: "7:00 PM – 9:00 PM",  capacity: 15, campus: "Senior Campus"  },
  { batchLetter: "M", name: "11th Std",                   timing: "6:30 PM – 9:00 PM",  capacity: 20, campus: "Senior Campus"  },
  { batchLetter: "N", name: "3rd–5th Std",                timing: "6:30 PM – 8:30 PM",  capacity: 10, campus: "Junior Campus"  },
  { batchLetter: "O", name: "Nestlings After School",     timing: "After School",        capacity: 10, campus: "Nestlings"      },
];

export const teachers = [
  { id: "t1", name: "Mr. Arun Anthony", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t2", name: "Mrs. Sivasankari", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t3", name: "Mr. Kishore", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t4", name: "Ms. Safrin", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t5", name: "Mr. Sathish", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t6", name: "Mr. Christopher", campus: "Senior Campus", subject: "—", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
  { id: "t7", name: "Ms. Archana", campus: "Senior Campus", subject: "Social Studies", kpiScore: 0, lateCount: 0, studentImprovement: 0, compliance: 0, portionCompletion: 0, retestHandling: 0, marksSla: 0 },
];

export const batches = [
  { id: "b1", name: "10th Science A", campus: "Senior Campus", avgMarks: 78, portionComplete: 82, retestRate: 18, health: "strong" as const, weakChapters: ["Trigonometry", "Organic Chemistry"], teacherResponsible: "Priya Sharma" },
  { id: "b2", name: "10th Science B", campus: "Senior Campus", avgMarks: 65, portionComplete: 70, retestRate: 32, health: "risk" as const, weakChapters: ["Algebra", "Thermodynamics", "Grammar"], teacherResponsible: "Sneha Reddy" },
  { id: "b3", name: "9th A", campus: "Senior Campus", avgMarks: 74, portionComplete: 78, retestRate: 22, health: "moderate" as const, weakChapters: ["Motion & Force", "Chemical Reactions"], teacherResponsible: "Amit Patel" },
  { id: "b4", name: "8th A", campus: "Junior Campus", avgMarks: 81, portionComplete: 88, retestRate: 14, health: "strong" as const, weakChapters: ["Cell Biology"], teacherResponsible: "Meera Joshi" },
  { id: "b5", name: "7th A", campus: "Junior Campus", avgMarks: 72, portionComplete: 75, retestRate: 25, health: "moderate" as const, weakChapters: ["Fractions", "Comprehension"], teacherResponsible: "Anita Desai" },
  { id: "b6", name: "Nursery A", campus: "Nestlings", avgMarks: 85, portionComplete: 90, retestRate: 10, health: "strong" as const, weakChapters: [], teacherResponsible: "Karan Malhotra" },
  { id: "b7", name: "10th CBSE", campus: "Senior Campus", avgMarks: 0, portionComplete: 0, retestRate: 0, health: "moderate" as const, weakChapters: [], teacherResponsible: "Ms. Archana" },
];

export const students = [
  // 10th Science A (Priya Sharma)
  { id: "s1", name: "Aarav Mehta", batch: "10th Science A", spi: 82, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-02-25", retestStatus: "none" as const },
  { id: "s2", name: "Diya Patel", batch: "10th Science A", spi: 68, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-02-22", retestStatus: "allocated" as const },
  { id: "s9", name: "Nikhil Verma", batch: "10th Science A", spi: 74, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-03-01", retestStatus: "none" as const },
  { id: "s10", name: "Priya Nair", batch: "10th Science A", spi: 91, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-03-05", retestStatus: "none" as const },
  { id: "s11", name: "Siddharth Rao", batch: "10th Science A", spi: 56, risk: "critical" as const, campus: "Senior Campus", lastTestDate: "2026-02-28", retestStatus: "pending" as const },
  { id: "s12", name: "Meghana Iyer", batch: "10th Science A", spi: 85, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-03-04", retestStatus: "none" as const },

  // 10th Science B (Sneha Reddy)
  { id: "s3", name: "Rohan Gupta", batch: "10th Science B", spi: 55, risk: "critical" as const, campus: "Senior Campus", lastTestDate: "2026-02-18", retestStatus: "pending" as const },
  { id: "s4", name: "Ishika Sharma", batch: "10th Science B", spi: 71, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-02-24", retestStatus: "none" as const },
  { id: "s13", name: "Tanvi Kulkarni", batch: "10th Science B", spi: 63, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-03-02", retestStatus: "none" as const },
  { id: "s14", name: "Harsh Agarwal", batch: "10th Science B", spi: 48, risk: "critical" as const, campus: "Senior Campus", lastTestDate: "2026-02-20", retestStatus: "pending" as const },
  { id: "s15", name: "Riya Deshmukh", batch: "10th Science B", spi: 76, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-03-03", retestStatus: "none" as const },
  { id: "s16", name: "Karthik Menon", batch: "10th Science B", spi: 59, risk: "critical" as const, campus: "Senior Campus", lastTestDate: "2026-02-26", retestStatus: "allocated" as const },

  // 9th A (Amit Patel)
  { id: "s5", name: "Arjun Singh", batch: "9th A", spi: 88, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-02-26", retestStatus: "none" as const },
  { id: "s6", name: "Kavya Reddy", batch: "9th A", spi: 45, risk: "critical" as const, campus: "Senior Campus", lastTestDate: "2026-02-15", retestStatus: "pending" as const },
  { id: "s17", name: "Aditya Hegde", batch: "9th A", spi: 79, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-03-01", retestStatus: "none" as const },
  { id: "s18", name: "Shruti Pillai", batch: "9th A", spi: 67, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-02-28", retestStatus: "none" as const },
  { id: "s19", name: "Manish Tiwari", batch: "9th A", spi: 72, risk: "watch" as const, campus: "Senior Campus", lastTestDate: "2026-03-04", retestStatus: "none" as const },
  { id: "s20", name: "Neha Saxena", batch: "9th A", spi: 93, risk: "safe" as const, campus: "Senior Campus", lastTestDate: "2026-03-05", retestStatus: "none" as const },

  // 8th A (Meera Joshi)
  { id: "s7", name: "Vivaan Kumar", batch: "8th A", spi: 91, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-02-27", retestStatus: "none" as const },
  { id: "s21", name: "Pooja Shetty", batch: "8th A", spi: 78, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-01", retestStatus: "none" as const },
  { id: "s22", name: "Rahul Pandey", batch: "8th A", spi: 64, risk: "watch" as const, campus: "Junior Campus", lastTestDate: "2026-02-25", retestStatus: "allocated" as const },
  { id: "s23", name: "Snehal Bhatt", batch: "8th A", spi: 86, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-03", retestStatus: "none" as const },
  { id: "s24", name: "Deepak Mishra", batch: "8th A", spi: 52, risk: "critical" as const, campus: "Junior Campus", lastTestDate: "2026-02-22", retestStatus: "pending" as const },
  { id: "s25", name: "Anushka Rathi", batch: "8th A", spi: 89, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-05", retestStatus: "none" as const },

  // 7th A (Anita Desai)
  { id: "s8", name: "Ananya Joshi", batch: "7th A", spi: 62, risk: "watch" as const, campus: "Junior Campus", lastTestDate: "2026-02-20", retestStatus: "completed" as const },
  { id: "s26", name: "Varun Choudhary", batch: "7th A", spi: 75, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-02", retestStatus: "none" as const },
  { id: "s27", name: "Lakshmi Nambiar", batch: "7th A", spi: 81, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-04", retestStatus: "none" as const },
  { id: "s28", name: "Gaurav Thakur", batch: "7th A", spi: 53, risk: "critical" as const, campus: "Junior Campus", lastTestDate: "2026-02-18", retestStatus: "pending" as const },
  { id: "s29", name: "Divya Chauhan", batch: "7th A", spi: 70, risk: "watch" as const, campus: "Junior Campus", lastTestDate: "2026-02-28", retestStatus: "none" as const },
  { id: "s30", name: "Saurav Kapoor", batch: "7th A", spi: 84, risk: "safe" as const, campus: "Junior Campus", lastTestDate: "2026-03-05", retestStatus: "none" as const },

  // Nursery A (Karan Malhotra)
  { id: "s31", name: "Aadhya Bansal", batch: "Nursery A", spi: 88, risk: "safe" as const, campus: "Nestlings", lastTestDate: "2026-03-01", retestStatus: "none" as const },
  { id: "s32", name: "Reyansh Gupta", batch: "Nursery A", spi: 92, risk: "safe" as const, campus: "Nestlings", lastTestDate: "2026-03-03", retestStatus: "none" as const },
  { id: "s33", name: "Myra Bhatia", batch: "Nursery A", spi: 79, risk: "safe" as const, campus: "Nestlings", lastTestDate: "2026-02-28", retestStatus: "none" as const },
  { id: "s34", name: "Kabir Sethi", batch: "Nursery A", spi: 85, risk: "safe" as const, campus: "Nestlings", lastTestDate: "2026-03-04", retestStatus: "none" as const },
  { id: "s35", name: "Saanvi Malhotra", batch: "Nursery A", spi: 90, risk: "safe" as const, campus: "Nestlings", lastTestDate: "2026-03-05", retestStatus: "none" as const },

  // 10th CBSE (Ms. Archana)
  { id: "s36", name: "Akarsh nixon", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s37", name: "S.Gokul", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s38", name: "S.Kanishka shree", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s39", name: "B.Sonakshi", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s40", name: "yogalakshmi", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s41", name: "K.Joshida", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s42", name: "D.Nithin", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
  { id: "s43", name: "Aashil ismath", batch: "10th CBSE", spi: 0, risk: "safe" as const, campus: "Senior Campus", retestStatus: "none" as const },
];

export const admins = [
  { id: "a1", name: "Rahul Verma", checklistCompletion: 94, retestSla: 88, feeTarget: 91, finalScore: 91 },
  { id: "a2", name: "Sunita Nair", checklistCompletion: 87, retestSla: 82, feeTarget: 85, finalScore: 85 },
];

export const dailyControlData = {
  teacherCheckedIn: 7,
  teacherTotal: 8,
  classesConducted: 38,
  classesScheduled: 40,
  marksPending: 2,
  retestPending: 5,
  studentsAbsent3Days: 3,
  feeCollectionPercent: 72,
  admissionCallsToday: 14,
  snackCompliance: true,
};

export const campusMetrics = [
  { campus: "Junior", avgMarks: 77, attendance: 92, portionComplete: 82, teacherCompliance: 93, feeCollection: 85, retestRate: 20 },
  { campus: "Senior", avgMarks: 72, attendance: 88, portionComplete: 76, teacherCompliance: 87, feeCollection: 78, retestRate: 28 },
  { campus: "Nestlings", avgMarks: 84, attendance: 95, portionComplete: 88, teacherCompliance: 90, feeCollection: 91, retestRate: 12 },
];

export const ihiTrend = [
  { week: "W1", ihi: 78, annotation: "" }, { week: "W2", ihi: 80, annotation: "" }, { week: "W3", ihi: 79, annotation: "Fee drop" },
  { week: "W4", ihi: 82, annotation: "" }, { week: "W5", ihi: 81, annotation: "Batch avg drop" }, { week: "W6", ihi: 83, annotation: "" },
  { week: "W7", ihi: 82, annotation: "Exam week" }, { week: "W8", ihi: 85, annotation: "" }, { week: "W9", ihi: 84, annotation: "" },
  { week: "W10", ihi: 83, annotation: "" }, { week: "W11", ihi: 86, annotation: "" }, { week: "W12", ihi: 83, annotation: "" },
];

export const feeTrend = [
  { month: "Sep", collected: 82, target: 90 },
  { month: "Oct", collected: 85, target: 90 },
  { month: "Nov", collected: 78, target: 90 },
  { month: "Dec", collected: 88, target: 90 },
  { month: "Jan", collected: 72, target: 90 },
  { month: "Feb", collected: 76, target: 90 },
];

export const alerts = [
  { id: 1, type: "danger" as const, severity: "critical" as const, message: "Rajesh Kumar late >6 times this month", timestamp: "2 hours ago" },
  { id: 2, type: "warning" as const, severity: "warning" as const, message: "10th SB batch avg dropped 3 consecutive weeks", timestamp: "5 hours ago" },
  { id: 3, type: "warning" as const, severity: "warning" as const, message: "Fee collection at 72% — below 75% threshold", timestamp: "1 day ago" },
  { id: 4, type: "danger" as const, severity: "critical" as const, message: "2 retest allocations pending >24 hrs", timestamp: "1 day ago" },
  { id: 5, type: "info" as const, severity: "info" as const, message: "Admin checklist at 94% — above 90% target", timestamp: "2 days ago" },
];

export const weeklyPlans = [
  { batch: "10th Science A", teacher: "Priya Sharma", portionPlanned: "Trigonometry Ch 8", testDate: "2026-03-01", status: "on-track" as const },
  { batch: "10th Science B", teacher: "Sneha Reddy", portionPlanned: "Organic Chemistry", testDate: "2026-03-02", status: "delayed" as const },
  { batch: "9th A", teacher: "Amit Patel", portionPlanned: "Motion & Force", testDate: "2026-02-28", status: "on-track" as const },
  { batch: "8th A", teacher: "Meera Joshi", portionPlanned: "Cell Biology", testDate: "2026-03-01", status: "completed" as const },
];

export const retestQueue = [
  { student: "Rohan Gupta", batch: "10th Science B", subject: "Mathematics", marks: 52, teacher: "Priya Sharma", status: "pending" as const, dueDate: "2026-02-27" },
  { student: "Kavya Reddy", batch: "9th A", subject: "Science", marks: 45, teacher: "Amit Patel", status: "pending" as const, dueDate: "2026-02-27" },
  { student: "Diya Patel", batch: "10th Science A", subject: "English", marks: 68, teacher: "Sneha Reddy", status: "allocated" as const, dueDate: "2026-02-28" },
  { student: "Ananya Joshi", batch: "7th A", subject: "Hindi", marks: 62, teacher: "Anita Desai", status: "completed" as const, dueDate: "2026-02-25", retestMarks: 78 },
];

export const attendanceLogs = [
  { teacher: "Priya Sharma", checkinTime: "7:45 AM", status: "on-time" as const, geoValid: true },
  { teacher: "Amit Patel", checkinTime: "7:50 AM", status: "on-time" as const, geoValid: true },
  { teacher: "Sneha Reddy", checkinTime: "8:05 AM", status: "late" as const, geoValid: true },
  { teacher: "Vikram Singh", checkinTime: "8:20 AM", status: "late" as const, geoValid: false },
  { teacher: "Anita Desai", checkinTime: "7:40 AM", status: "on-time" as const, geoValid: true },
  { teacher: "Rajesh Kumar", checkinTime: "—", status: "absent" as const, geoValid: false },
  { teacher: "Meera Joshi", checkinTime: "7:55 AM", status: "on-time" as const, geoValid: true },
  { teacher: "Karan Malhotra", checkinTime: "8:10 AM", status: "late" as const, geoValid: true },
];
