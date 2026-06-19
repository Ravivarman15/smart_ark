import { useEffect, useState } from "react";
import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
} from "lucide-react";
import arkLogo from "@/assets/ark-logo.jpeg";
import { leadsService } from "../services/leads.service";
import { leadCoursesService } from "../services/leadCourses.service";
import { publicLeadSchema } from "../schemas/lead.schema";

// Class/grade options — self-contained so the public form never needs an
// authenticated lookup of the standards table.
const GRADE_OPTIONS = [
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6",
  "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12",
  "Other / Not sure",
];

const EMPTY = {
  studentName: "",
  parentName: "",
  phone: "",
  email: "",
  course: "",
  standard: "",
  message: "",
};

const inputCls =
  "w-full bg-muted/50 border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/50 " +
  "focus:border-accent/50 transition-all";

const Field = ({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
      {label} {required && <span className="text-ark-danger">*</span>}
    </label>
    {children}
    {error && <p className="text-ark-danger text-xs mt-1">{error}</p>}
  </div>
);

/** Public, unauthenticated lead capture form for Meta Ads / landing pages.
 *  Styled to match the ARK admission enquiry form. */
const PublicLeadFormPage = () => {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [courses, setCourses] = useState<string[]>([]);

  // Load the admin-managed course list (anon RLS allows reading active courses).
  useEffect(() => {
    leadCoursesService.listActiveNames().then(setCourses).catch(() => setCourses([]));
  }, []);

  const set = (key: keyof typeof EMPTY) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const parsed = publicLeadSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await leadsService.submitPublic({
        studentName: parsed.data.studentName,
        parentName: parsed.data.parentName || undefined,
        phone: parsed.data.phone,
        email: parsed.data.email || undefined,
        course: parsed.data.course || undefined,
        standard: parsed.data.standard || undefined,
        message: parsed.data.message || undefined,
        source: "landing",
      });
      setDone(true);
    } catch (err) {
      const kind = (err as { kind?: string })?.kind;
      setFormError(
        kind === "PermissionDenied"
          ? "Submissions are temporarily unavailable. Please call the institute directly or try again shortly."
          : (err as Error)?.message || "Something went wrong. Please try again or call us.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen gradient-navy flex items-center justify-center p-4 py-10">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-ark-pink/5 rounded-full blur-3xl" />
      </div>

      <div className="glass-card w-full max-w-2xl p-6 sm:p-8 animate-slide-up relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img src={arkLogo} alt="ARK Learning Arena" className="w-20 h-20 rounded-2xl mb-3 shadow-lg" />
          <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">ARK Learning Arena</h1>
          <p className="text-muted-foreground text-sm mt-1">Admission Enquiry Form</p>
        </div>

        {done ? (
          <div className="flex flex-col items-center text-center py-8">
            <CheckCircle2 className="w-14 h-14 text-ark-success mb-4" />
            <h2 className="text-lg font-display font-semibold text-foreground">Thank you for your interest!</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Your enquiry has been received. Our counselor will reach out to you on the phone number you
              provided very soon.
            </p>
            <button
              type="button"
              onClick={() => { setForm(EMPTY); setDone(false); }}
              className="mt-6 text-sm font-medium text-accent hover:underline"
            >
              Submit another enquiry
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Student Name" required error={errors.studentName}>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className={inputCls} value={form.studentName} onChange={set("studentName")} placeholder="Full name of the student" />
                </div>
              </Field>

              <Field label="Parent / Guardian Name" error={errors.parentName}>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className={inputCls} value={form.parentName} onChange={set("parentName")} placeholder="Parent or guardian name" />
                </div>
              </Field>

              <Field label="Phone Number" required error={errors.phone}>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className={inputCls} value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="Contact number" />
                </div>
              </Field>

              <Field label="Email Address" error={errors.email}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className={inputCls} value={form.email} onChange={set("email")} inputMode="email" placeholder="email@example.com" />
                </div>
              </Field>

              <Field label="Class / Grade" error={errors.standard}>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select className={inputCls + " appearance-none"} value={form.standard} onChange={set("standard")}>
                    <option value="">Select class / grade</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </Field>

              <Field label="Course of Interest" error={errors.course}>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  {courses.length > 0 ? (
                    <select className={inputCls + " appearance-none"} value={form.course} onChange={set("course")}>
                      <option value="">Select course</option>
                      {courses.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={inputCls} value={form.course} onChange={set("course")} placeholder="e.g. NEET, JEE, Foundation, Tuition" />
                  )}
                </div>
              </Field>
            </div>

            <Field label="Message (optional)" error={errors.message}>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <textarea
                  className={inputCls + " min-h-[90px] resize-y pt-2.5"}
                  value={form.message}
                  onChange={set("message")}
                  placeholder="Anything you'd like us to know?"
                />
              </div>
            </Field>

            {formError && <p className="text-ark-danger text-sm text-center">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full gradient-accent text-accent-foreground font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-accent/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Submitting..." : "Submit Enquiry"}
            </button>

            <p className="text-[11px] text-muted-foreground text-center">
              By submitting, you agree to be contacted by ARK Learning Arena regarding your admission enquiry.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default PublicLeadFormPage;
