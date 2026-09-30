# Prediction tracking maintenance

Tracking is independent of Outlook generation. Never use tracking results to alter Outlook factors, selection, confidence, or review cadence.

## Data and assessment rules

`Data/prediction-tracking.json` uses version 2. A prediction has `kind: "event"` for an occurrence within its window or `kind: "persistence"` for a condition throughout the window. Its `deadline` must follow `created` and must not exceed `outlookSnapshot.validUntil`.

Only an event's fully supported outcome can resolve early. Persistence, partial support, negative results, and unverifiable results require a run after the full Europe/Zurich deadline day. Conclusive whole-window results require `evidenceThrough` equal to the deadline. An unverifiable result may report shorter coverage, explaining what could not be established. Evidence refers to events inside the original window even if a source is published later.

The validator checks dates and declared conditions; source interpretation remains AI-assisted. Classification and success/failure conditions must faithfully represent the original Outlook.

## Migration

The initial empty version 1 document was upgraded without changing settings or retrospectively creating predictions. For another empty version 1 document:

```sh
node site/scripts/prediction-tracking.mjs --migrate
```

Automatic migration rejects nonempty version 1 history rather than guessing prediction types or rewriting past results. Such a migration requires an explicit reviewed mapping and preservation of original records.

## History protection and reviewed corrections

`validate-prediction-history.mjs` checks every committed transition and current working changes. It catches intermediate rewrites even when the final version restores the original data, and checks every merge parent. Existing original records, final assessments and correction entries cannot be deleted or overwritten. This is a publishing safeguard, not an access-control system for repository owners.

Corrections require an explicit user request, never a daily automation decision. Create a temporary batch with `date` and `corrections: [{predictionId, correction: {id, corrected, reason, sources, assessment}}]`. The revised `assessment` is optional for an explanatory annotation. A revised verdict must still satisfy the original prediction conditions and timing rules. `corrected` and revised `assessment.assessed` equal the batch date, which must be the actual Zurich run date. Then run:

```sh
node site/scripts/prediction-tracking.mjs --correct /tmp/corrections.json --reviewed
node site/scripts/validate-prediction-history.mjs
```

The original assessment remains intact. The published page shows the correction and original assessment; result filters use the most recent revised verdict. An annotation alone does not change that verdict. Do not commit the temporary batch.

## Daily reservations and attempt accounting

The existing `maximumCreationsPerRun` and `maximumAssessmentsPerRun` settings remain compatible names, but apply across the entire day. Defaults remain one creation and two final assessments. New settings cap assessment attempts at two, creation-candidate evaluations at two, and additional lookups per assessment at three. They may be reduced within those ceilings. A recorded daily budget is immutable; lowering settings restricts new work without invalidating historical records. Raising settings cannot replenish an existing day’s reservation budget.

After the normal briefing and selected Outlook research, run:

```sh
node site/scripts/prediction-tracking.mjs --date YYYY-MM-DD
node site/scripts/prediction-tracking.mjs --date YYYY-MM-DD --reserve
```

The first command is read-only. The second atomically records selected attempts and returns newly reserved `work`. Commit and push only the tracking JSON with `tracking: reserve prediction work for YYYY-MM-DD` before researching those entries. Keep unfinished briefing and Outlook edits out of that checkpoint. Ensure local HEAD represents the pushed tracking checkpoint; the writer and CI require the reservation to precede completion in Git history. The checkpoint may trigger an additional static site build, but no visitor or build AI calls.

Every reservation spends an attempt immediately. A later invocation will not reselect it that day. Interrupted reservations are preserved without outcomes; never repeat their research that day. Pending predictions become eligible again on later days within the same limits. Creation candidates are ordered by oldest prior attempt, preventing an unsuitable first topic from permanently blocking others. Stop after one successful creation and mark unused candidate work `not-needed`.

The outcome batch accepts `additions`, `assessments: [{id, assessment, additionalLookups}]`, and `attemptOutcomes: [{attemptId, status, explanation, additionalLookups}]`. Status is `pending` for an unresolved assessment, `skipped` for an unsuitable creation candidate, or `not-needed` for unused work. Final predictions/assessments automatically complete their reservations. Lookup counts are required and must be actual additional tracking lookups; reused briefing research is not an additional lookup. Before deadline, assessment `lookupLimit` is zero. Creation lookup allowance is always zero. The ledger makes these counts auditable; scripts cannot intercept an agent’s web tool calls.

```sh
node site/scripts/prediction-tracking.mjs --date YYYY-MM-DD --apply /tmp/prediction-batch.json
node site/scripts/validate-prediction-history.mjs
```

Commit completed tracking data with the normal atomic daily briefing and Outlook update. Never commit temporary batches. Do not backdate writes, alter settings during a daily run, or delete attempt history to reset limits. Disabling tracking stops reservation and daily result writes before reading Outlooks or briefing files. Explicit reviewed maintenance corrections remain a separate operation.

Writers use an exclusive local lock and atomic file replacement. A lock left after process termination may be removed only after confirming no writer remains active; preserve the committed attempt ledger. Locks and temporary writer files are ignored by Git.

## Checks

```sh
node --test site/tests/prediction-tracking.test.mjs
node site/scripts/prediction-tracking.mjs --validate
node site/scripts/validate-prediction-history.mjs
bash site/build.sh
```

Keep `README.md`, `AGENTS.md`, visitor methodology, and `roadmap.md` synchronized when behavior changes. The roadmap remains reference-only for daily runs.
