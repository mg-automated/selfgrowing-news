#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [repositoryRoot, outputPath] = process.argv.slice(2);
if (!repositoryRoot || !outputPath) {
  throw new Error("Usage: generate-topic-badges.mjs REPOSITORY_ROOT OUTPUT_PATH");
}

const topics = (await readdir(path.join(repositoryRoot, "Topics")))
  .filter((name) => name.endsWith(".md") && name !== ".gitkeep");
const outlookData = JSON.parse(
  await readFile(path.join(repositoryRoot, "Data", "topic-outlooks.json"), "utf8"),
);
const outlooks = outlookData.outlooks ?? {};
const badges = Object.fromEntries(
  topics.map((name) => [name.slice(0, -3).toLowerCase(), { mentions: 0, outlook: name in outlooks }]),
);

for (const name of await readdir(path.join(repositoryRoot, "News", "Daily"))) {
  if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
  const markdown = await readFile(path.join(repositoryRoot, "News", "Daily", name), "utf8");
  const linked = new Set(
    [...markdown.matchAll(/\[[^\]]+\]\(\.\.\/\.\.\/Topics\/([^\s)#]+\.md)(?:#[^)]*)?\)/g)]
      .map((match) => decodeURIComponent(match[1]).slice(0, -3).toLowerCase()),
  );
  for (const topic of linked) {
    if (!(topic in badges)) throw new Error(`${name} links to missing topic ${topic}`);
    badges[topic].mentions += 1;
  }
}

for (const name of Object.keys(outlooks)) {
  if (!(name.slice(0, -3).toLowerCase() in badges)) {
    throw new Error(`Outlook has no topic page: ${name}`);
  }
}

await writeFile(outputPath, JSON.stringify(badges) + "\n");
console.log(`Generated explorer badges for ${topics.length} topics.`);
