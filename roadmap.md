# Project roadmap

Status: **Planning record — implementation requires an explicit user request.**

Review baseline: `mg-automated/selfgrowing-news`, commit `38f1630d54a44108206406867169d0946c804581`.

Prepared: 2026-09-30. Recheck findings against the current code before implementing them.

## Purpose and boundaries

Keep the daily news archive, topic pages, Outlooks, and Outlook track record reliable as the archive grows. Prioritize correctness before performance work.

Preserve Markdown as the canonical editorial source, the static website architecture, and the existing Outlook factors and forecast methodology. Keep prediction tracking optional and its current limits of one new prediction and two assessments per day. Any proposed change to scheduling, assessment rules, or research accounting requires its own implementation decision.

This roadmap records future work. It is not an instruction for the daily automation to implement changes. Keep operational instructions in `AGENTS.md`; update them only when an approved change is ready.

## Priority overview

| ID | Priority | Work | Timing | Status |
| --- | --- | --- | --- | --- |
| R01 | High | Make prediction assessment timing rigorous | Implemented 2026-09-30 | Complete |
| R02 | High | Protect published prediction history | Implemented 2026-09-30 | Complete |
| R03 | High | Add deterministic editorial validation | Next correctness work | Proposed |
| R04 | Medium | Enforce and explain tracking research limits | Implemented 2026-09-30 | Complete |
| R05 | Medium | Fix freshness detection | Before relying on unattended operation | Proposed |
| R06 | Medium | Publish a daily-briefing-only RSS feed | Next maintenance work | Proposed |
| R07 | Medium | Define continuous news coverage windows | Next workflow review | Proposed |
| R08 | Medium | Prevent Outlook review starvation | Next Outlook scheduling review | Proposed |
| R09 | High at scale | Replace full-history AI reading with indexed retrieval | Before archive reading becomes costly | Deferred |
| R10 | Medium at scale | Bound topic, search, and graph payloads | After measuring archive growth | Deferred |
| R11 | Medium | Consolidate parsing and validate rendered links | Alongside relevant script changes | Proposed |
| R12 | Low | Reduce configuration and documentation drift | Routine maintenance | Proposed |

## First: correctness and dependable operation

### R01 — Make prediction assessment timing rigorous

**Implemented 2026-09-30:** Version 2 declares event/persistence types, bounds deadlines to the original Outlook horizon, and validates full-window evidence and Zurich deadline-day rules. Empty version 1 data migrates without changing settings; existing legacy records require reviewed migration. Covered by tracking regression tests and a full Quartz build.

**Finding:** Validation permits window-wide claims to be marked supported before the window ends, insufficiently recent evidence for a failed prediction, and deadlines beyond the captured Outlook's validity horizon. These paths were reproduced with synthetic inputs; they are not evidence of incorrect published results.

**Change:** Distinguish event-occurrence claims from claims that must hold throughout a period. Enforce the relevant assessment window and evidence coverage. Keep deadlines within the original forecast horizon unless an explicit, documented rule supports a different horizon. Preserve the original Outlook snapshot and avoid changing its factors.

**Affected:** `site/scripts/prediction-tracking.mjs`, tracking tests, `Data/prediction-tracking.json` schema and documentation.

**Acceptance:** An occurrence claim can resolve early when verified; a persistence claim cannot be confirmed before its window closes. A failed claim requires evidence covering the necessary deadline. An unsupported deadline is rejected. Existing records have an explicit migration policy if the schema changes.

### R02 — Protect published prediction history

**Implemented 2026-09-30:** Shared history validation rejects deleted/rewritten forecasts, snapshots, final results and prior corrections. CI checks every committed transition, including intermediate rewrites and merge parents, plus working changes. The reviewed correction operation appends source-linked amendments; visitors retain both original and corrected outcomes. Verified with Git-history fixtures, rendering tests, regression tests and a full Quartz build.

**Finding:** The batch writer protects history, but direct JSON edits can bypass those protections. Current-file validation does not compare the proposed data with previously committed data.

**Change:** Validate against the prior committed version. Reject deletions and changes to immutable forecast snapshots or finalized results. Provide a transparent, append-only correction mechanism for legitimate mistakes. Explain that the track record evaluates selected measurable claims, rather than every statement in every Outlook.

**Affected:** Tracking validator, deployment workflow, `Data/prediction-tracking.json`, track-record methodology text.

**Acceptance:** CI rejects rewritten or deleted historical records. A documented correction remains visible alongside the original record. Normal additions and valid pending assessments pass.

### R03 — Add deterministic editorial validation

**Finding:** A successful site build and the existing tracking tests do not verify the complete editorial contract.

**Change:** Add a shared validator used before the daily commit and in CI. Check the ten-story requirement, required fields, coverage timestamps, topic links, and relevant JSON consistency. Define optional-feature failure behavior explicitly: invalid tracking data must never publish misleading results, and disabling research must reliably stop tracking work.

**Affected:** New validation script, `.github/workflows/deploy-site.yml`, `AGENTS.md`, daily task instructions, script tests.

**Acceptance:** Representative malformed briefings and data fail with actionable errors; valid content passes. Test tracking enabled, disabled, and malformed-data cases. Document whether a feature error blocks publication or uses a clearly identified safe fallback.

### R04 — Enforce and explain tracking research limits

**Implemented 2026-09-30:** Durable pre-research reservations cap assessment attempts at two per day, count Pending/interrupted work, bound reported lookups, and permit two existing-research creation candidates for one new prediction. Candidates rotate by prior attempt date; deferred reporting uses the actual remaining allowance. Writers require prior committed reservations, protect attempt history, reject backdated CLI writes, and use locking/atomic replacement. The daily task now permits a tracking-only checkpoint before research. Verified by repeated-run, interruption, fallback, lookup-limit, off-switch, Git-checkpoint and regression tests, plus a full Quartz build. Lookup limits are audited records and agent instructions, not web-call interception.

**Finding:** Limits on completed assessments do not necessarily limit research attempts. Selection can stop at an unsuitable first prediction candidate, and the deferred list can omit work when part of the daily assessment allowance has already been consumed.

**Change:** Define separate limits for research attempts and recorded results. Persist enough attempt metadata to prevent repeated work across runs. Offer eligible candidates in order and stop after one acceptable new prediction. Calculate deferred work using the actual remaining allowance.

**Affected:** `site/scripts/prediction-tracking.mjs`, tracking settings and tests, operational documentation.

**Acceptance:** Repeated same-day runs respect both attempt and result limits. Unsuitable candidates cannot cause unlimited research. Deferred reporting includes every unselected due assessment. Turning tracking off prevents new tracking research and writes.

### R05 — Fix freshness detection

**Finding:** Outlook expiry is evaluated against the latest archived briefing date. If publication stops, stale forecasts can continue to appear current.

**Change:** Evaluate expiry against the current date with a documented timezone. Add a visitor-side freshness check so time passing without a new build still produces an accurate warning. Show when the archive was last successfully updated.

**Affected:** `site/scripts/enrich-topics.mjs`, injected browser behavior, freshness display.

**Acceptance:** An expired Outlook and an overdue archive are identified even when no new briefing or build occurs. Verify Zurich timezone boundaries and avoid falsely marking valid forecasts stale.

### R06 — Publish a daily-briefing-only RSS feed

**Finding:** The live feed includes navigation and other non-briefing pages, displacing daily news entries.

**Change:** Filter feed entries to actual daily briefing pages and use their editorial dates.

**Affected:** `site/quartz.config.yaml` and the feed-generation integration.

**Acceptance:** The feed contains only daily briefings, ordered correctly, with valid dates and working links. Navigation, topic, and track-record pages never appear as news items.

### R07 — Define continuous news coverage windows

**Finding:** Rolling 24-hour windows based on actual execution times can produce gaps or overlaps as daily runs drift.

**Change:** Choose and document a fixed-cutoff or last-successful-cutoff policy, including delayed and missed runs. Resolve the tradeoff between strict last-24-hours coverage and catching up after a missed run before changing the workflow.

**Affected:** Daily task instructions, `AGENTS.md`, briefing coverage metadata and validation.

**Acceptance:** Normal runs have contiguous windows. Delay, missed-run, overlap, and daylight-saving cases follow the chosen policy without unexplained omissions or duplicates.

### R08 — Prevent Outlook review starvation

**Finding:** Topics linked in today's briefing can repeatedly occupy every research slot, leaving expired Outlooks and candidates waiting indefinitely.

**Change:** Introduce an aging rule, maximum wait, or reserved slot within the existing research budget. Keep the forecast factors and methodology intact; this proposal changes review scheduling only.

**Affected:** `site/scripts/select-outlooks.mjs`, selector tests and scheduling documentation.

**Acceptance:** A repeatedly deferred expired Outlook eventually receives a review. Candidates have a documented opportunity for consideration. Daily research and creation caps remain unchanged.

## Later: scale the archive without changing its purpose

### R09 — Replace full-history AI reading with indexed retrieval

**Finding:** The daily task and `AGENTS.md` require reading the complete archive. Removing that requirement from only one location would leave the other requirement active. Deterministic scripts scanning files are much cheaper than repeatedly asking the AI to read all their contents.

**Change:**

1. Generate a compact yearly story index, such as `Data/story-index/2026.json`, with a source-hash manifest.
2. Store stable story identity, date, headline, deterministically extracted factual text, topic links, source URLs, and original Markdown path. Preserve identity through corrections; do not rely solely on story position.
3. Read the previous 14 calendar days directly. List all topic filenames and open topic pages selectively.
4. Search older index entries by topic, headline terms, and sources; retrieve up to five relevant older matches per candidate and inspect original sections when needed.
5. Build the initial index from the existing archive, then update changed entries incrementally in the same daily commit. Detect corrections and missing or invalid index data; support a complete rebuild.
6. Update both `AGENTS.md` and the daily task prompt together, after verifying the replacement retrieval workflow.

No embeddings API or additional AI summarization is required. Markdown remains canonical, and indexes are disposable derived data.

**Affected:** New index/retrieval scripts, `Data/story-index/`, daily workflow, `AGENTS.md`, task prompt and tests.

**Acceptance:** An older duplicate beyond 14 days is found; a material development retrieves its earlier context; corrections invalidate stale entries; retrieval limits hold. Measure one-year and five-year synthetic archives and compare briefing quality and reading volume before switching.

### R10 — Bound topic, search, and graph payloads

**Finding:** Collapsed topic history is still downloaded in full. Topic timelines, search text, and graph data grow with the archive. Synthetic tests showed fast enrichment but substantially growing page content; they do not establish browser performance limits.

**Change:** Measure representative desktop and mobile performance. Split older topic history into year/month pages or lazy-loaded chunks. Separate lean graph metadata from full search text, and add a useful graph range or aggregation strategy. Keep the entire archive accessible through stable links.

**Affected:** `site/scripts/enrich-topics.mjs`, search/index generation, graph integration and archive navigation.

**Acceptance:** Initial topic-page payload is bounded as older history grows. Historical links and search remain usable. Define measured payload and interaction budgets before selecting an implementation; verify against one-year and five-year datasets.

## Ongoing maintenance

### R11 — Consolidate parsing and validate rendered links

**Change:** Share daily-story and topic-link parsing across scripts. Document the current flat `News/Daily/` layout and test any future layout migration. Restrict custom-rendered links to approved schemes and valid internal destinations; reject executable schemes.

**Affected:** Enrichment, Outlook selection, topic badges, latest-briefing and custom inline rendering.

**Acceptance:** Shared fixtures produce consistent story/link extraction. Existing URLs remain stable. Unsafe link schemes are rejected without breaking ordinary source URLs or internal links.

### R12 — Reduce configuration and documentation drift

**Change:** Bring deployment documentation in line with actual triggers. Centralize site base-path configuration if hosting portability becomes necessary. Review external browser dependencies for reproducibility when updating them.

**Affected:** Root/site documentation, build configuration, browser scripts and hosting-path references.

**Acceptance:** Documentation matches deployed behavior. A base-path change, if supported, works across navigation, filters, badges and source links. Keep the existing pinned Quartz build and locked installation reproducible.

## How to use this roadmap

Implement one approved work item at a time. For each item, record its decision, implementation commit, checks, and remaining limitations here. Recheck linked code before starting; archive growth and later fixes may change the priority.

R01, R02 and R04 were implemented as separately tested changes. R03 remains proposed, followed by R05–R08. Plan R09 before full-history reading becomes burdensome, and use measurements to decide when R10 is necessary. R11 and R12 can accompany related maintenance.

No changes to production code, deployment, daily automation, or Outlook behavior are made by accepting this document as a planning record.
