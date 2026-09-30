#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDirectory = process.argv[2];
if (!publicDirectory) {
  throw new Error("Usage: open-source-links-in-new-tab.mjs PUBLIC_DIRECTORY");
}

const sourceLabel = /<strong\b[^>]*>\s*Sources:\s*<\/strong>/i;
const paragraphs = /<p\b[^>]*>[\s\S]*?<\/p>/gi;

function setAttribute(attributes, name, value) {
  const pattern = new RegExp("(\\s" + name + "\\s*=\\s*)([\"'])(.*?)\\2", "i");
  const existing = attributes.match(pattern);

  if (name === "target" && existing) {
    return attributes.replace(pattern, ' target="_blank"');
  }

  if (name === "rel" && existing) {
    const tokens = new Set(existing[3].split(/\s+/).filter(Boolean));
    for (const token of value.split(/\s+/)) tokens.add(token);
    return attributes.replace(pattern, ' rel="' + [...tokens].join(" ") + '"');
  }

  return existing ? attributes : attributes + " " + name + '="' + value + '"';
}

function updateSourceParagraph(paragraph) {
  if (!sourceLabel.test(paragraph)) return paragraph;

  return paragraph.replace(/<a\b([^>]*)>/gi, (tag, rawAttributes) => {
    const href = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const destination = href?.[1] ?? href?.[2] ?? "";
    if (!/^https?:\/\//i.test(destination)) return tag;

    let attributes = setAttribute(rawAttributes, "target", "_blank");
    attributes = setAttribute(attributes, "rel", "noopener noreferrer");
    return "<a" + attributes + ">";
  });
}

async function processDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await processDirectory(file);
    } else if (entry.name.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      const updated = html.replace(paragraphs, updateSourceParagraph);
      if (updated !== html) await writeFile(file, updated);
    }
  }
}

await processDirectory(publicDirectory);
