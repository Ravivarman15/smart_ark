-- ═══════════════════════════════════════════════════════════════════════════
-- AI Question Paper Import
--
-- Adds ONLY what is missing. It does not create a second exam engine, a second
-- question bank, or a second paper table:
--
--   • mcq_questions   — EXTENDED with the metadata the AI extracts
--                       (bloom level, tags, board, subjective answer key).
--   • mcq_papers      — reused as-is for the generated paper.
--   • mcq_exams       — reused as-is for the online test.
--
-- The two NEW tables are a staging area, not question storage: an uploaded
-- file (question_paper_imports) and the AI's per-question candidates awaiting
-- faculty review (question_paper_extractions). Once a candidate is approved it
-- is written into mcq_questions — the existing bank — and the staging row keeps
-- a pointer for audit. Nothing is duplicated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend the existing question bank ───────────────────────────────────
ALTER TABLE public.mcq_questions
  ADD COLUMN IF NOT EXISTS bloom_level  TEXT,          -- remember|understand|apply|analyze|evaluate|create
  ADD COLUMN IF NOT EXISTS tags         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS board        TEXT,          -- CBSE / ICSE / State / ...
  ADD COLUMN IF NOT EXISTS standard_id  UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  -- Answer key for the non-choice types the importer can now ingest
  -- (fill_ups, one_word, short_answer, long_answer, essay, case_study, …).
  -- Choice types keep using `options`; numerical keeps using numerical_answer.
  ADD COLUMN IF NOT EXISTS answer_text  TEXT,
  -- Match-the-following pairs / nested sub-questions, when the paper has them.
  ADD COLUMN IF NOT EXISTS match_pairs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sub_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- false ⇒ the grading engine routes this question to teacher evaluation
  -- (Smart Mark Entry) instead of auto-scoring it.
  ADD COLUMN IF NOT EXISTS auto_evaluable BOOLEAN NOT NULL DEFAULT true,
  -- Provenance: which uploaded paper this question came from (NULL = hand-authored).
  ADD COLUMN IF NOT EXISTS source_import_id UUID;

CREATE INDEX IF NOT EXISTS idx_mcq_questions_bloom  ON public.mcq_questions(bloom_level);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_board  ON public.mcq_questions(board);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_tags   ON public.mcq_questions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_source ON public.mcq_questions(source_import_id);
-- Duplicate detection for "reuse existing question if duplicate" (Step 6):
-- normalised text hash, computed by the service before insert.
ALTER TABLE public.mcq_questions
  ADD COLUMN IF NOT EXISTS text_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_mcq_questions_text_hash ON public.mcq_questions(text_hash);

-- Sections (Part A / Part B / Part C) belong to the paper↔question link, not
-- to the question itself — a question can sit in Part A of one paper and
-- Part B of another.
ALTER TABLE public.mcq_paper_questions
  ADD COLUMN IF NOT EXISTS section TEXT;

-- ── 2. Uploaded paper (one row per file) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_paper_imports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name      TEXT NOT NULL,
  file_type      TEXT NOT NULL,            -- pdf | docx | xlsx | csv | text
  file_size      INTEGER NOT NULL DEFAULT 0,
  storage_path   TEXT,                     -- question-papers bucket; NULL for pasted text
  -- Text handed to the extractor. Kept so a re-run never needs the file again.
  raw_text       TEXT NOT NULL DEFAULT '',
  -- uploaded → extracting → review → committed | failed
  status         TEXT NOT NULL DEFAULT 'uploaded',
  error          TEXT,
  -- What the AI detected about the paper as a whole: exam name, subject,
  -- standard, board, term, month, duration, total marks, instructions, sections.
  detected_meta  JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  -- Set once the import is committed into the bank / a paper.
  paper_id       UUID REFERENCES public.mcq_papers(id) ON DELETE SET NULL,
  campus_id      UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qp_imports_status  ON public.question_paper_imports(status);
CREATE INDEX IF NOT EXISTS idx_qp_imports_creator ON public.question_paper_imports(created_by);

-- ── 3. Extracted question candidates (staging, pre-approval) ───────────────
CREATE TABLE IF NOT EXISTS public.question_paper_extractions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id    UUID NOT NULL REFERENCES public.question_paper_imports(id) ON DELETE CASCADE,
  -- Ordering + provenance so the reviewer can see the original alongside.
  question_no  TEXT,
  section      TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  source_text  TEXT NOT NULL DEFAULT '',   -- verbatim slice of the paper
  -- The AI's structured candidate, in the exact McqQuestionInput shape the
  -- existing bank service already accepts.
  extracted    JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence   NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- pending → approved | rejected. Only `approved` rows are committed.
  status       TEXT NOT NULL DEFAULT 'pending',
  -- Filled on commit: the bank question this became (new OR the existing
  -- duplicate it was matched to).
  question_id  UUID REFERENCES public.mcq_questions(id) ON DELETE SET NULL,
  duplicate_of UUID REFERENCES public.mcq_questions(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qp_extractions_import ON public.question_paper_extractions(import_id);
CREATE INDEX IF NOT EXISTS idx_qp_extractions_status ON public.question_paper_extractions(status);

-- ── 4. RLS — authenticated staff only, same posture as the MCQ module ──────
ALTER TABLE public.question_paper_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_paper_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read question_paper_imports"  ON public.question_paper_imports;
CREATE POLICY "read question_paper_imports" ON public.question_paper_imports
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write question_paper_imports" ON public.question_paper_imports;
CREATE POLICY "write question_paper_imports" ON public.question_paper_imports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "read question_paper_extractions"  ON public.question_paper_extractions;
CREATE POLICY "read question_paper_extractions" ON public.question_paper_extractions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "write question_paper_extractions" ON public.question_paper_extractions;
CREATE POLICY "write question_paper_extractions" ON public.question_paper_extractions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4b. Let a student ANSWER the new question types ────────────────────────
-- The importer can now produce fill_ups / one_word / match_following and the
-- subjective types. Those answers are text, not an option id — without this
-- column the answer has nowhere to live and the grader would score a typed
-- answer as 0. `pending_review` marks the rows a teacher must still evaluate.
ALTER TABLE public.mcq_answers
  ADD COLUMN IF NOT EXISTS text_value     TEXT,
  ADD COLUMN IF NOT EXISTS pending_review BOOLEAN NOT NULL DEFAULT false;

-- A part-auto/part-teacher paper has a score that is not final until the
-- subjective questions are marked. Persist that state so the result screen,
-- report card and comms never publish a provisional score as a final one.
ALTER TABLE public.mcq_attempts
  ADD COLUMN IF NOT EXISTS pending_marks        NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awaiting_evaluation  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mcq_answers_pending
  ON public.mcq_answers(pending_review) WHERE pending_review;
CREATE INDEX IF NOT EXISTS idx_mcq_attempts_awaiting
  ON public.mcq_attempts(awaiting_evaluation) WHERE awaiting_evaluation;

-- ── 5. Storage bucket for the original files (version history / re-run) ────
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-papers', 'question-papers', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "question-papers read"  ON storage.objects;
CREATE POLICY "question-papers read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'question-papers');
DROP POLICY IF EXISTS "question-papers write" ON storage.objects;
CREATE POLICY "question-papers write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'question-papers');
DROP POLICY IF EXISTS "question-papers delete" ON storage.objects;
CREATE POLICY "question-papers delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'question-papers');
