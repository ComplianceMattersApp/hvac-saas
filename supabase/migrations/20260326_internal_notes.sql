-- Internal scratchpad notes (not tied to any job).
-- One note per row, owned by the internal user who created it.

CREATE TABLE IF NOT EXISTS "public"."internal_notes" (
  "id"         uuid        DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    uuid        NOT NULL,
  "body"       text        NOT NULL,
  "is_pinned"  boolean     DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- Keep updated_at current on every row change
CREATE TRIGGER set_internal_notes_updated_at
  BEFORE UPDATE ON public.internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: each user can only read/write their own notes
ALTER TABLE "public"."internal_notes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_notes_select_own" ON "public"."internal_notes"
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "internal_notes_insert_own" ON "public"."internal_notes"
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "internal_notes_update_own" ON "public"."internal_notes"
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "internal_notes_delete_own" ON "public"."internal_notes"
  FOR DELETE USING (auth.uid() = user_id);
