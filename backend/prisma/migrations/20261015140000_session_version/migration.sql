-- Preserve existing users and sessions at version zero. Password resets
-- increment this version atomically with the password change in application code.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

COMMIT;
