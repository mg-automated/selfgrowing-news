import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const contentRoot = process.argv[2]
if (!contentRoot) throw new Error("Usage: node latest-briefing.mjs <content-root>")

const dailyFiles = (await readdir(join(contentRoot, "News", "Daily")))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  .sort()

if (dailyFiles.length === 0) throw new Error("No daily briefings found")

const latest = dailyFiles.at(-1)
const marker = "<!-- LATEST_BRIEFING_LINK -->"
const indexPath = join(contentRoot, "index.md")
const index = await readFile(indexPath, "utf8")
if (index.split(marker).length !== 2) {
  throw new Error("Expected exactly one latest-briefing marker in index.md")
}

const link = `[${latest.slice(0, -3)}](News/Daily/${latest})`
await writeFile(indexPath, index.replace(marker, link))
