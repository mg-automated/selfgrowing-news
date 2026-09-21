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

Use stable, readable, kebab-style filenames that preserve proper-name capitalization, such as `Artificial-Intelligence.md` or `Swiss-Federal-Council.md`.

## Topic files

Keep topic pages intentionally simple. After the standard frontmatter, include:

- a level-one heading containing the clear topic title; and
- a brief, durable description of what the topic is.

Do not maintain manual lists of all news articles mentioning a topic. Obsidian backlinks provide that relationship automatically.

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
9. the daily file is complete before it is committed.
