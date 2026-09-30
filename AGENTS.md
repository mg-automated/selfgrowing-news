# Repository Instructions

## Purpose and scope

This repository is an Obsidian-compatible Markdown news archive. These instructions apply to the entire repository and to every future Codex or Claude task performed in it.

A daily automated task researches and archives the 10 most important developments from the preceding 24 hours across:

- International Politics
- Swiss Politics
- Technology

The archive must become more useful over time by connecting daily stories to reusable topic pages. Write all generated content in English.

## Repository structure

- Store daily news entries at `News/Daily/YYYY-MM-DD.md`.
- Store topic pages at `Topics/<Topic-Name>.md`.
- Create these directories if they are absent.
- Keep at most one daily news file for each date.
- Do not use `.gitkeep` files as content or link targets; they exist only to retain otherwise empty directories in Git.

## Website build boundary

- `/site/` contains the Quartz website configuration, custom styling, build script, and deployment documentation.
- The source of truth for published content remains the repository-level `News/` and `Topics/` directories.
- Daily news tasks must not modify files under `/site/`, `.github/workflows/`, or other deployment configuration.
- Do not regenerate, delete, or reorganize `/site/` during a daily archive task.
- Modify `/site/` only when the user explicitly requests website, Quartz, styling, hosting, or deployment changes.
- Generated Quartz runtime files and build output must remain ignored and must not be committed.
- Changes to `/site/` require separate validation and an appropriate structural commit message.

## Dates, timestamps, and frontmatter

Use Europe/Zurich local time for file dates and timestamps. Use ISO 8601 timestamps including the applicable UTC offset (for example, `2026-09-18T09:30:00+02:00`).

Every generated daily file and topic page must begin with this frontmatter:

```yaml
---
created: YYYY-MM-DDTHH:MM:SS+HH:MM
updated: YYYY-MM-DDTHH:MM:SS+HH:MM
---
```

When creating a file, set `created` and `updated` to the same timestamp. When modifying an existing file, preserve `created` exactly and change only `updated`. Do not overwrite an existing daily file blindly: inspect it and update it deliberately while preserving valid archive content.

## Daily news content

Each daily file must contain exactly 10 important news developments from the preceding 24 hours. Select stories by significance; do not enforce a fixed quota among International Politics, Swiss Politics, and Technology.

After the daily title and coverage window, add an `## Overview` section before the first story. Write one concise paragraph of two to four sentences that synthesizes the day's 10 selected developments, highlights the most consequential themes, and connects related stories where useful. Base the overview exclusively on the selected stories: do not introduce unsupported claims, separate developments, or an implicit eleventh story. The overview must be written in English and should orient the reader rather than repeat all 10 headlines.

Every story must contain:

- a headline;
- a concise, factual summary of two to four sentences;
- a short **Why it matters** explanation;
- one or more relevant internal topic links; and
- external source links to reliable original sources or high-quality reporting.

Use multiple reliable sources when appropriate, especially for major, disputed, or politically sensitive developments. Do not select a story merely because it is popular or heavily covered. Prefer substantive developments to speculation, commentary, clickbait, and minor incremental reporting.

Clearly separate internal topic links from external source links in every story, using labels such as **Topics:** and **Sources:**.

## Duplicate and developing stories

Before selecting stories, inspect all existing files in `News/Daily/`. Do not repeat a previously archived story unless a meaningful new development occurred. A continuing story may appear again after a material change, but the new entry must focus on what changed rather than restating earlier coverage.

## Topics

Every news story must link to one or more relevant topic pages. Choose a small number of meaningful, reasonably specific topics. Potential topics include Artificial Intelligence, OpenAI, Large Language Models, AI Agents, Swiss Federal Council, European Union, Ukraine, and NATO, but create these only when they are relevant to an archived story. Avoid generic topics that convey little information, such as `News`.

Before creating a topic, inspect `Topics/` and reuse an existing page whenever it represents the same concept. Avoid duplicate or near-duplicate pages arising from spelling, capitalization, abbreviations, singular/plural forms, or naming differences. Codex is responsible for choosing and consolidating appropriate topics as the archive grows, without unnecessarily replacing valid existing topic pages.

Create a new topic when it represents a durable subject likely to connect future developments. For an isolated story, use an existing broader topic if it accurately fits; if none exists, create a reusable broader topic rather than a page tied narrowly to that single story. Never force a story into an inaccurate topic.

Use stable, readable, kebab-style filenames that preserve proper-name capitalization, such as `Artificial-Intelligence.md` or `Swiss-Federal-Council.md`.

## Topic files

Keep topic pages intentionally simple. After the standard frontmatter, include:

- a level-one heading containing the clear topic title; and
- a brief, durable description of what the topic is.

Do not maintain manual lists of all news articles mentioning a topic. Obsidian backlinks provide that relationship automatically.

## Topic outlooks

Forward-looking topic assessments are stored separately from durable topic notes in `Data/topic-outlooks.json`. Quartz injects these structured Outlooks into topic pages at build time; do not paste generated Outlook prose into `Topics/*.md`.

Keep Outlooks explicitly probabilistic and separate verified scheduled events from forecasts. Every Outlook must include its review date, validity date, next-review date, confidence, concise assessment, supporting sources, and any dated events used in the assessment. Describe future events as scheduled because they may be postponed or cancelled. Never present a predicted election result, military outcome, market movement, legal decision, or other uncertain development as fact.

The daily task must not research every Outlook indiscriminately. After drafting the daily briefing, run:

```text
node site/scripts/select-outlooks.mjs --date YYYY-MM-DD
```

Use the Europe/Zurich briefing date. The selector records linked topics without Outlooks in the persistent `candidates` queue in `Data/topic-outlooks.json`; include that automatic queue update in the daily commit. Research and update only the returned `selected` entries. Selection is deterministic and prioritizes Outlooks linked from the new briefing, approaching or elapsed scheduled events, overdue reviews, forecasts nearing expiry, and then queued creation candidates. The total number of Outlook-related research subjects is capped at four per run, including reviews and creation candidates; entries in `deferred` remain queued for a later run.

At most two queued topics may be evaluated per run and at most one new Outlook may be created. Prefer recurring topics with multiple archived mentions. First decide whether the briefing's existing research establishes an ongoing subject, a meaningful forecast horizon, and identifiable future events or change signals. Perform additional web research only when needed, and reuse already verified sources across related Outlooks. Create an Outlook only when the archived evidence and verified forward-looking sources support a useful assessment.

After evaluating a `consider-create` entry, update its candidate metadata in `Data/topic-outlooks.json`. If an Outlook is created, remove its candidate entry. Otherwise increment `attempts`, set `lastAttempt` to the briefing date, and retain it in the queue. After every third unsuccessful attempt, set `eligibleAfter` to 30 days after the briefing date; topics encountered during cooldown may gain mentions but must not be researched. Do not increment attempts unless the candidate was actually evaluated.

When an Outlook is actually verified against current sources:

- update `reviewed` even if the assessment remains valid;
- update `materiallyUpdated` only when substantive forecast content changes;
- set a new `nextReview` appropriate to volatility: normally 1 day for active wars, elections, or crises; 3 days for active regulation, companies, or policy; 7 days for stable topics; and 14–30 days for dormant topics;
- replace, remove, or reschedule events that occurred, were postponed, or were cancelled;
- set `validUntil` to the end of the defensible forecast horizon; and
- preserve source URLs that still support the assessment and add current sources for changed claims.

An expired Outlook is rendered with an `Awaiting review` warning. Do not advance review dates without actual source verification. Create a new Outlook only when the topic has enough archived evidence for a useful forecast; it is acceptable for a topic to have no Outlook.

## Optional prediction tracking

Prediction tracking is a separate, prospective record in `Data/prediction-tracking.json`. It must never alter Outlook factors, selection, confidence, wording, cadence or research limits. Results must not feed back into Outlook generation. Run it only after completing the normal briefing research and selected Outlook updates.

First read `settings.enabled`. If false, skip all prediction generation, assessment, and additional research; preserve existing records and continue the normal daily workflow. When true, run:

```text
node site/scripts/prediction-tracking.mjs --date YYYY-MM-DD
```

Only work on the returned `creations` and `assessments`. The initial pilot tracks four existing Outlook topics, allows one active prediction per topic, at most one creation and two assessments across the entire day, and at least 30 days between predictions for a topic. Do not bypass these limits or retrospectively score earlier Outlooks.

For a creation, use only an Outlook actually source-verified on this briefing date and the research already available. Additional research solely to create a prediction is prohibited. Skip if there is no useful, defensible, measurable expectation. A scheduled event occurring as announced is not a prediction. Record a unique `id`, `topicFile`, `created`, `deadline` (a future YYYY-MM-DD), `statement`, original `successCondition`, `failureCondition`, optional `partialCondition`, `confidence` (low/medium/high), `sources` (label/url objects), and `outlookSnapshot` (an exact copy of the complete current Outlook object). Make conditions explicit and limited to the forecast horizon; do not manufacture numerical thresholds or narrow claims unsupported by the Outlook. Preserve original wording and conditions permanently. New assessments attach to the record without replacing it.

For an assessment, reuse verified briefing/Outlook research first. Before deadline, leave pending unless conclusive in-window evidence establishes the outcome. A deadline includes its entire Europe/Zurich calendar day: do not record `not-supported` or `unverifiable` until a subsequent run after that day ends. At deadline, targeted verification is permitted for selected records only; limit additional source lookups to three per assessment, then use `unverifiable` if evidence remains insufficient. No archived mention is not proof of failure. For negative predictions or conditions requiring persistence across the horizon, wait until the full window closes. Later publications may establish what happened within the window, but events after deadline must not count as successes.

An assessment has `assessed` (actual run date), `evidenceThrough` (last day of the outcome window examined, not publication date), `result` (`supported`, `partly-supported`, `not-supported`, or `unverifiable`), `explanation` and `sources`. Partial support requires an original predefined partial condition; never invent one after seeing the outcome. Do not imply the AI independently graded itself without interpretation: source-linked judgments are AI-assisted. Never fabricate outcomes or silently remove failed predictions. A final assessment is preserved; factual corrections must be transparent and reviewed separately, not overwritten by the daily run.

Apply additions and assessments through a temporary JSON batch with shape `{ "date": "YYYY-MM-DD", "additions": [], "assessments": [{ "id": "...", "assessment": { ... } }] }`, using:

```text
node site/scripts/prediction-tracking.mjs --date YYYY-MM-DD --apply /tmp/prediction-batch.json
node site/scripts/prediction-tracking.mjs --validate
```

Do not commit the temporary batch. The writer enforces selection, dates, snapshots, append-only updates, and daily caps. Never change settings during a daily run. Commit changed prediction data with the normal atomic daily commit. When paused, overdue records remain unassessed; on resuming, resolve them against their original windows within the same limits. Website builds only render stored data and never perform AI calls or research.

## Links

Use standard Markdown links, not Obsidian wikilinks. From a file in `News/Daily/`, link to topic files with relative paths, for example:

```markdown
[Artificial Intelligence](../../Topics/Artificial-Intelligence.md)
```

This relative form is the repository convention and keeps the vault portable in Obsidian and ordinary Markdown tools. Do not use the Obsidian-specific `app://-/Topics/...` form for generated links. Ensure every internal Markdown link resolves to an existing file before committing.

## Sources and factual integrity

External source links should point to the actual source material whenever possible. Never invent URLs, citations, quotations, dates, or facts. Verify that source links support the claims attributed to them.

## Safety and repository integrity

- Before changing anything, inspect the repository and follow existing conventions unless they conflict with this file.
- Never force-push.
- Never delete existing archive content merely to regenerate it.
- Never replace valid existing topic pages unnecessarily.
- Do not commit partially generated or obviously incomplete daily entries.
- Validate all internal Markdown links before considering a task complete.
- Keep the repository usable as a normal Obsidian vault.

## Git conventions

For a successfully generated daily entry, use this commit message exactly, substituting the file date:

```text
news: add daily briefing for YYYY-MM-DD
```

For structural or configuration changes, use an appropriate concise commit message. The normal automated workflow is intended to commit and push successful daily updates directly to the repository's default branch. Never force-push.

## Daily-task completion checklist

Before completing a daily archive task, confirm that:

1. the target date uses Europe/Zurich local time and no second daily file exists for that date;
2. existing daily files were reviewed for duplicate or developing stories;
3. the file contains exactly 10 substantive developments from the preceding 24 hours;
4. the `## Overview` section accurately synthesizes those 10 stories without introducing a separate development;
5. every entry has a headline, a two-to-four-sentence factual summary, a **Why it matters** explanation, topic links, and reliable source links;
6. every linked topic file exists and duplicate topics were avoided;
7. all internal Markdown links resolve;
8. timestamps follow the creation/update rules; and
9. the Outlook selector was run, only its selected entries were researched, and changed structured Outlooks were validated; and
10. optional prediction tracking obeyed its enabled switch, selection and daily caps; the original Outlook process was preserved; and
11. the daily file is complete before it is committed.
