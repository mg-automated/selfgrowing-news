# The Growing News Archive site

This directory contains the Quartz configuration and presentation layer for the news archive. The archive itself remains in the repository-level `News/` and `Topics/` directories.

## Status

The site is published through GitHub Pages at:

```text
https://mg-automated.github.io/selfgrowing-news/
```

The deployment workflow runs automatically when a daily briefing is committed to `main`. It can also be started manually for testing or recovery.

## Local build

Requirements:

- Git
- Node.js 24
- npm 10.9.2 or newer

From the repository root, run:

```bash
bash site/build.sh
```

The script downloads the pinned Quartz release into `site/.quartz-runtime/`, copies the current `News/` and `Topics/` content into it, applies this site's configuration and styling, and builds the result at:

```text
site/.quartz-runtime/public/
```

The runtime and generated output are ignored by Git.

During the build, `site/scripts/enrich-topics.mjs` derives a chronological **How the story developed** section for each published topic page. It extracts only the matching story sections from daily briefings that link to that topic and includes recent topic momentum. The script also injects any current structured Outlook from `Data/topic-outlooks.json`. This generated material exists only on the website; the repository-level topic notes remain intentionally simple and continue to rely on normal Obsidian backlinks.

The homepage includes an animated archive graph generated from the daily briefings and topic links. Visitors can play the archive from its first day, scrub to a specific date or open a graph node directly.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy-site.yml` builds and deploys the site when a Markdown file under `News/Daily/` changes on `main`. To run it manually:

1. Open **Actions → Deploy Quartz site to GitHub Pages**.
2. Select **Run workflow**.

If a custom domain or Cloudflare Pages is used instead, update `configuration.baseUrl` in `site/quartz.config.yaml` before deployment.

## Quartz version

The build is pinned to Quartz commit `3dff48b5df6d84c9544a5ae19c8f2cbb01dc44e5` so an upstream change cannot silently alter or break the site. Updating Quartz should be done deliberately by changing `QUARTZ_COMMIT` in `site/build.sh`, then running and reviewing a local build.
