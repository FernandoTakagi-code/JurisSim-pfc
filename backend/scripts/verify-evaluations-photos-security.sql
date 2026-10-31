-- Prepared only; run AFTER authorized DDL, through the backend database role.
-- Catalogs and privilege functions only: never reads application records.
-- Can also run inside the creation transaction BEFORE COMMIT (no boundary here).
DO $verify$
DECLARE
  table_name text;
  role_name text;
  privilege_name text;
  table_oid oid;
  owner_oid oid;
  bypass_rls boolean;
  forced_rls boolean;
BEGIN
  SELECT r.rolsuper OR r.rolbypassrls INTO bypass_rls
    FROM pg_catalog.pg_roles r WHERE r.rolname = current_user;
  IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'Backend schema access unavailable.';
  END IF;
  FOREACH table_name IN ARRAY ARRAY['Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto'] LOOP
    SELECT c.oid, c.relowner, c.relforcerowsecurity
      INTO table_oid, owner_oid, forced_rls
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
        AND c.relkind = 'r' AND c.relrowsecurity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expected table or RLS missing.'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = table_oid) THEN
      RAISE EXCEPTION 'Unexpected row policy; manual review required.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c,
        LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
      WHERE c.oid = table_oid AND a.grantee = 0
    ) THEN RAISE EXCEPTION 'PUBLIC table privileges remain.'; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = role_name
                     AND NOT r.rolsuper AND NOT r.rolbypassrls) THEN
        RAISE EXCEPTION 'Expected untrusted role missing or privileged.';
      END IF;
      FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
        IF pg_catalog.has_table_privilege(role_name, table_oid, privilege_name) THEN
          RAISE EXCEPTION 'Browser role retains effective table privileges.';
        END IF;
      END LOOP;
      IF pg_catalog.has_any_column_privilege(role_name, table_oid, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Browser role retains column privileges.';
      END IF;
    END LOOP;
    IF NOT (coalesce(bypass_rls, false) OR
            (pg_catalog.pg_has_role(current_user, owner_oid, 'USAGE') AND NOT forced_rls)) THEN
      RAISE EXCEPTION 'Backend would be filtered by RLS.';
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT pg_catalog.has_table_privilege(current_user, table_oid, privilege_name) THEN
        RAISE EXCEPTION 'Backend table privilege missing.';
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Security metadata checks passed.';
END;
$verify$;
