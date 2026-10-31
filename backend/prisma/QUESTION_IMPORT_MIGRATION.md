# Questão import provenance: migration and backfill plan

The migration `20261021100000_question_import_provenance` is additive. It adds nullable provenance/fingerprint columns to `Questao` and creates `LoteImportacao`; it does not update or delete existing question, alternative, diagnostic, answer, or assessment rows. It gives the new batch table backend-only RLS and revokes browser-role privileges.

## Existing rows and nullable fingerprints

All questions that exist when this migration runs receive `NULL` in the new optional columns. PostgreSQL permits multiple `NULL` values in a unique index, so the unique fingerprint index can be created without assuming that old questions are unique. It protects new rows whose fingerprint is populated.

Until a reviewed backfill completes, an old question with `fingerprint = NULL` will not be found by the import repository's fingerprint lookup. Consequently, an import or manual creation may duplicate an old row. Keep the definitive import write path disabled during this interval; the ordinary CRUD is protected against duplicates that already have fingerprints.

## Backfill before enabling imports

1. In a read-only run against a disposable copy of the target schema, calculate hashes using `fingerprintQuestionContent` and the existing alternatives, including which alternative is correct.
2. Produce a report of total questions, hash groups with more than one row, and questions referenced by diagnostics, answers, or assessments. Do not change question content or remove any row.
3. For each exact duplicate group, select a deterministic representative (oldest `createdAt`, then lowest `id`) to hold the unique fingerprint. Keep the other historical rows and leave their fingerprint `NULL`; the representative still blocks an exact imported duplicate.
4. Assign fingerprints to non-duplicate rows in bounded transactions. Verify that each historical exact-content group has one representative and that no non-null fingerprints collide.
5. Only after review of that report should the import write path be enabled. Manual CRUD must compute the same fingerprint for both create and update, as it does in this branch.

This policy adds metadata only and preserves every pre-existing question and relationship. A duplicate historical row left with a null fingerprint remains visible and usable under its existing rules.

## PostgreSQL disposable validation required

Before authorizing the migration outside a disposable database, validate the SQL against a PostgreSQL version matching the target; confirm the new FK and unique index names/types match Prisma; test duplicate historical groups and null semantics; verify RLS and grants for the actual `anon` and `authenticated` roles; and test serializable concurrent inserts, unique conflicts, nested alternative failure rollback, FK restrict behavior, and preservation of existing assessment/diagnostic/answer rows. Do not use a live or production database for this validation.
