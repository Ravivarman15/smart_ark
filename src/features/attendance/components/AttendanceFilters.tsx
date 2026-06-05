import { useMemo, useState } from "react";
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
} from "../hooks/useAttendanceLookups";

interface Props {
  batchId: string;
  onBatchChange: (id: string) => void;
  date?: string;
  onDateChange?: (d: string) => void;
  showDate?: boolean;
}

const ALL = "__all__";

/**
 * Cascading attendance filter bar: Academic Year → Course Type → Standard →
 * Batch (+ Date). The academic / course-type / standard pickers narrow the
 * batch list entirely client-side using the ids carried on each batch lookup.
 */
export const AttendanceFilters = ({
  batchId,
  onBatchChange,
  date,
  onDateChange,
  showDate = true,
}: Props) => {
  const { data: years = [] } = useAcademicYearOptions();
  const { data: courseTypes = [] } = useCourseTypeOptions();
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();

  const [yearId, setYearId] = useState(ALL);
  const [courseTypeId, setCourseTypeId] = useState(ALL);
  const [standardId, setStandardId] = useState(ALL);

  const filteredBatches = useMemo(
    () =>
      batches.filter(
        (b) =>
          (yearId === ALL || b.academicYearId === yearId) &&
          (courseTypeId === ALL || b.courseTypeId === courseTypeId) &&
          (standardId === ALL || b.standardId === standardId),
      ),
    [batches, yearId, courseTypeId, standardId],
  );

  // Clear a stale batch selection when the narrowed list no longer contains it.
  const handleNarrow = (next: () => void) => {
    next();
    if (batchId && !filteredBatches.some((b) => b.id === batchId)) onBatchChange("");
  };

  return (
    <>
      <Select value={yearId} onValueChange={(v) => handleNarrow(() => setYearId(v))}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Academic Year" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Years</SelectItem>
          {years.map((y) => (
            <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={courseTypeId} onValueChange={(v) => handleNarrow(() => setCourseTypeId(v))}>
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Course Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Courses</SelectItem>
          {courseTypes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={standardId} onValueChange={(v) => handleNarrow(() => setStandardId(v))}>
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Standard" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Standards</SelectItem>
          {standards.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={batchId} onValueChange={onBatchChange}>
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Select a batch" /></SelectTrigger>
        <SelectContent>
          {filteredBatches.length === 0 ? (
            <SelectItem value="__none__" disabled>No batches</SelectItem>
          ) : (
            filteredBatches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {showDate && onDateChange && (
        <Input
          type="date"
          value={date ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-8 w-40"
        />
      )}
    </>
  );
};
