#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: inject-topic-badges.mjs PUBLIC_DIRECTORY");
const tag = '<script src="/selfgrowing-news/static/topic-badges.js" defer></script>';

async function inject(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await inject(file);
    } else if (entry.name.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      // Quartz also emits redirect stubs with no body; they have no explorer.
      if (!html.includes("</body>")) continue;
      if (!html.includes(tag)) await writeFile(file, html.replace("</body>", `${tag}</body>`));
    }
  }
}

await inject(directory);
