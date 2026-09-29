#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [repositoryRoot, publicDirectory] = process.argv.slice(2);
if (!repositoryRoot || !publicDirectory) {
  throw new Error("Usage: inject-build-info.mjs REPOSITORY_ROOT PUBLIC_DIRECTORY");
}

const git = (...args) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const branch = process.env.GITHUB_REF_NAME || git("branch", "--show-current") || "detached";
const builtAt = new Date().toISOString();
const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const details = `<p class="site-build-info">Branch ${escapeHtml(branch)} · Commit <a href="https://github.com/mg-automated/selfgrowing-news/commit/${commit}" title="${commit}">${commit.slice(0, 7)}</a> · Built <time datetime="${builtAt}">${builtAt.slice(0, 16).replace("T", " ")} UTC</time></p>`;
const footerOpening = /(<footer\b[^>]*>\s*<p\b[^>]*>[\s\S]*?<\/p>)/;

async function inject(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inject(file);
    } else if (entry.name.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      if (!html.includes("<footer")) continue; // Quartz redirect stubs have no footer.
      if (!footerOpening.test(html)) throw new Error(`Cannot find footer attribution in ${file}`);
      await writeFile(file, html.replace(footerOpening, `$1${details}`));
    }
  }
}

await inject(publicDirectory);
