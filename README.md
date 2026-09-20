# Self-Growing News

Self-Growing News is an automated, open Markdown archive of important daily developments in:

- international politics;
- Swiss politics; and
- technology.

The project publishes one daily briefing containing ten substantive developments from the preceding 24 hours. Its purpose is not only to collect news, but to build a connected knowledge archive that becomes more useful over time.

## How the archive works

Every day, an automated ChatGPT task:

1. reviews the existing archive to identify stories already covered;
2. researches current reporting from the preceding 24 hours;
3. selects ten developments based on significance rather than popularity;
4. summarizes each development in concise, factual language;
5. explains briefly why the development matters;
6. links the story to relevant reusable topic pages;
7. includes links to the original reporting and primary sources;
8. validates the internal links; and
9. commits the completed briefing to this repository.

There is no fixed quota for the three subject areas. The balance depends on the significance of developments during that particular news cycle.

## Editorial principles

The automated workflow is instructed to:

- prefer substantive developments over speculation, commentary and clickbait;
- use original sources and reputable reporting whenever possible;
- consult multiple sources for major, disputed or politically sensitive stories;
- avoid repeating previously archived stories unless something meaningful has changed;
- clearly distinguish source links from internal topic links;
- never invent facts, quotations, dates or URLs; and
- avoid publishing incomplete or unverified daily briefings.

Story selection inevitably involves judgment. Inclusion in a briefing does not imply endorsement of a source, person, organisation or political position.

## Repository structure

- [`News/Daily/`](News/Daily/) contains the daily briefings.
- [`Topics/`](Topics/) contains reusable pages for countries, organisations, technologies and continuing subjects.
- [`site/`](site/) contains the Quartz configuration used to build the archive as a navigable website.

Daily entries and topic pages use standard Markdown and ISO 8601 timestamps based on the `Europe/Zurich` timezone. The repository remains compatible with Obsidian and other Markdown tools.

## Connected knowledge

Each story links to one or more topic pages. These connections make it possible to follow a subject across multiple days without maintaining a manually curated index.

When published through Quartz, the same links can also be explored through backlinks and an interactive knowledge graph.

## Sources and verification

Every archived story includes links to the reporting or primary material used to prepare its summary. Readers should follow these links when they need complete context or authoritative information.

This archive is created with automated AI-assisted research and summarization. Although the workflow includes source verification and consistency checks, errors, omissions or outdated information can still occur. The archive should not be treated as a substitute for professional journalism or as legal, financial or other professional advice.

## Corrections

If an entry contains a factual error, broken source link or misleading summary, it should be corrected transparently in the relevant Markdown file. The repository's Git history preserves a record of such changes.

## Technology

The archive combines:

- GitHub for versioning and publication;
- Markdown for portable content;
- Obsidian compatibility for local exploration;
- Quartz for the optional public website; and
- ChatGPT for automated research, summarization, topic linking and repository maintenance.
