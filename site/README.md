# Self-growing News site

This directory contains the Quartz configuration and presentation layer for the news archive. The archive itself remains in the repository-level `News/` and `Topics/` directories.

## Status

The site is prepared but not published. The GitHub Pages workflow is manual-only and GitHub Pages must be explicitly enabled before it can deploy anything.

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

## Publish later with GitHub Pages

Nothing in the repository publishes automatically. When publication is desired:

1. Open the repository's **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy Quartz site to GitHub Pages**.
4. Run the workflow manually.

The configured Pages URL is expected to be:

```text
https://mg-automated.github.io/selfgrowing-news/
```

If a custom domain or Cloudflare Pages is used instead, update `configuration.baseUrl` in `site/quartz.config.yaml` before deployment.

## Quartz version

The build is pinned to Quartz commit `3dff48b5df6d84c9544a5ae19c8f2cbb01dc44e5` so an upstream change cannot silently alter or break the site. Updating Quartz should be done deliberately by changing `QUARTZ_COMMIT` in `site/build.sh`, then running and reviewing a local build.

