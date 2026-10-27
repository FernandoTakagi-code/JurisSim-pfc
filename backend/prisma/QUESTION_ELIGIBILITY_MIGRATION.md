# Question eligibility metadata migration

Migration `20261021120000_question_eligibility_metadata` adds nullable,
structured origin, review, publication, rights, official-exam and alternative
letter fields. It intentionally does not update existing question rows. A
legacy row remains ineligible until its metadata is reviewed and recorded; in
particular, `publica`, author, class membership and free-text provenance are not
used to infer origin, approval or reproduction rights.

The migration reuses `fonteNome`, `fonteReferencia`, `licencaOuAutorizacao`,
`loteImportacaoId` and `fingerprint` from
`20261021100000_question_import_provenance`. It does not add another source,
license-text, import-batch or fingerprint field.

No unique index is added for official OAB identity yet. Before a later migration
adds one, produce a read-only duplicate report grouped by
`(oabExame, oabEdicao, oabTipoProva, oabNumeroQuestao)` for records with
`origem = OAB_OFICIAL` and all identity fields populated. Resolve each group
through a reviewed, auditable decision without deleting or overwriting question
content. Then add a partial unique index over those four fields, scoped to
`OAB_OFICIAL` rows with complete identity metadata. Validate that strategy on a
disposable PostgreSQL database before deployment.

Alternative letters are nullable to preserve existing records. The unique
`(questaoId, letra)` index allows multiple NULL letters in PostgreSQL and
prevents two alternatives for one question from claiming the same A-D letter.
Legacy alternative ordering must be reviewed before letters are populated.
