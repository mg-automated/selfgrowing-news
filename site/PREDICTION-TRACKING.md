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

## Checks

```sh
node --test site/tests/prediction-tracking.test.mjs
node site/scripts/prediction-tracking.mjs --validate
bash site/build.sh
```

Keep `README.md`, `AGENTS.md`, visitor methodology, and `roadmap.md` synchronized when behavior changes. The roadmap remains reference-only for daily runs.
