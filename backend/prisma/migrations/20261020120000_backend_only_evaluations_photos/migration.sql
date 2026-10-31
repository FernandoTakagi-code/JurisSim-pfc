-- Backend-only access. Apply with creation migrations in ONE outer transaction.
-- No BEGIN/COMMIT here: the approved runner must own the transaction boundary.
-- Never edit historical migrations or change schema-wide default privileges.
DO $preflight$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind = 'r'
    ) THEN
      RAISE EXCEPTION 'Security prerequisite missing: expected table.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid = pg_catalog.to_regclass(format('public.%I', table_name))
    ) THEN
      RAISE EXCEPTION 'Unexpected existing policy; manual review required.';
    END IF;
  END LOOP;
END;
$preflight$;

ALTER TABLE public."Avaliacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvaliacaoQuestao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_AvaliacaoToTurma" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProfilePhoto" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public."Avaliacao", public."AvaliacaoQuestao",
  public."_AvaliacaoToTurma", public."ProfilePhoto"
FROM PUBLIC, anon, authenticated;

-- No policies for browser roles and no grants to browser roles.
-- Preserve owners, trusted backend roles, foreign keys and existing data.
-- NO FORCE RLS: the backend must retain its verified owner/BYPASSRLS access.
-- Absent anon/authenticated roles or dependent grants deliberately cause failure.
