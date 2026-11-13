-- Practice ownership is handled by the backend, never direct browser access.
ALTER TABLE "SessaoPratica" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SessaoPratica" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE "SessaoPratica" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE "SessaoPratica" FROM authenticated;
  END IF;
END $$;
