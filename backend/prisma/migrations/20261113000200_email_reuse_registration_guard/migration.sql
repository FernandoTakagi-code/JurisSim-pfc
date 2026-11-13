-- Serialize registrations and block decisions for the normalized identity.
-- This guard covers every Prisma registration path, including invitations.
CREATE FUNCTION guard_email_reuse() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE normalized TEXT;
BEGIN
  normalized := lower(btrim(NEW."email"));
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized, 424));
  IF EXISTS (SELECT 1 FROM "EmailReuseBlock" WHERE "emailNormalized" = normalized AND "revokedAt" IS NULL) THEN
    RAISE EXCEPTION 'Email registration unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_email_reuse_guard BEFORE INSERT OR UPDATE OF "email" ON "User"
FOR EACH ROW EXECUTE FUNCTION guard_email_reuse();

CREATE FUNCTION lock_email_reuse_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."emailNormalized", 424));
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_reuse_decision_lock BEFORE INSERT OR UPDATE ON "EmailReuseBlock"
FOR EACH ROW EXECUTE FUNCTION lock_email_reuse_decision();
