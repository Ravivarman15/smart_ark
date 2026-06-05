import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAcademicYearOptions,
  useBatchOptions,
  useCourseTypeOptions,
  useStandardOptions,
} from "../../hooks/useAttendanceLookups";
import type { StudentAnalyticsFilters } from "../types/analytics.types";

interface Props {
  value: StudentAnalyticsFilters;
  onChange: (f: StudentAnalyticsFilters) => void;
}

const ALL = "__all__";

/** Cascading academic filters + date range for the analytics pages. */
export const AnalyticsFilters = ({ value, onChange }: Props) => {
  const { data: years = [] } = useAcademicYearOptions();
  const { data: courseTypes = [] } = useCourseTypeOptions();
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();

  const set = (patch: Partial<StudentAnalyticsFilters>) => onChange({ ...value, ...patch });

  const filteredBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          (!value.academicYearId || b.academicYearId === value.academicYearId) &&
          (!value.courseTypeId || b.courseTypeId === value.courseTypeId) &&
          (!value.standardId || b.standardId === value.standardId),
      ),
    [batches, value.academicYearId, value.courseTypeId, value.standardId],
  );

  return (
    <>
      <Select value={value.academicYearId ?? ALL} onValueChange={(v) => set({ academicYearId: v === ALL ? undefined : v, batchId: undefined })}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Academic Year" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Years</SelectItem>
          {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.courseTypeId ?? ALL} onValueChange={(v) => set({ courseTypeId: v === ALL ? undefined : v, batchId: undefined })}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Course Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Courses</SelectItem>
          {courseTypes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.standardId ?? ALL} onValueChange={(v) => set({ standardId: v === ALL ? undefined : v, batchId: undefined })}>
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Standard" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Standards</SelectItem>
          {standards.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.batchId ?? ALL} onValueChange={(v) => set({ batchId: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Batch" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Batches</SelectItem>
          {filteredBatches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} className="h-8 w-40" />
      <span className="text-muted-foreground">→</span>
      <Input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} className="h-8 w-40" />
    </>
  );
};
