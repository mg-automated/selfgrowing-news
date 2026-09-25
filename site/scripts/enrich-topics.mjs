#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const dailyDirectory = path.join(contentRoot, "News", "Daily")
const topicsDirectory = path.join(contentRoot, "Topics")
const generatedStart = "<!-- generated-topic-stories:start -->"
const generatedEnd = "<!-- generated-topic-stories:end -->"

function linkedTopicFiles(markdown) {
  const topics = new Set()
  const linkPattern = /\[[^\]]+\]\(\.\.\/\.\.\/Topics\/([^\s)#]+\.md)(?:#[^)]*)?\)/g

  for (const match of markdown.matchAll(linkPattern)) {
    try {
      topics.add(decodeURIComponent(match[1]))
    } catch {
      topics.add(match[1])
    }
  }

  return topics
}

function storiesFromDailyFile(markdown, date) {
  const headings = [...markdown.matchAll(/^##\s+(?:\d+\.\s+)?(.+)$/gm)].filter(
    (heading) => heading[1].trim().toLowerCase() !== "overview",
  )
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : markdown.length
    const section = markdown.slice(start, end).trim()
    const topics = linkedTopicFiles(section)
    const excerpt = section
      .replace(/^\*\*Topics:\*\*.*$(?:\r?\n)?/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    return {
      date,
      headline: heading[1].trim(),
      excerpt,
      topics,
    }
  })
}

function removeGeneratedSection(markdown) {
  const start = markdown.indexOf(generatedStart)
  const end = markdown.indexOf(generatedEnd)

  if (start === -1 || end === -1 || end < start) {
    return markdown.trimEnd()
  }

  return (markdown.slice(0, start) + markdown.slice(end + generatedEnd.length)).trimEnd()
}

const dailyFiles = (await readdir(dailyDirectory))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  .sort()

const storiesByTopic = new Map()

for (const dailyFile of dailyFiles) {
  const date = dailyFile.slice(0, -3)
  const markdown = await readFile(path.join(dailyDirectory, dailyFile), "utf8")

  for (const story of storiesFromDailyFile(markdown, date)) {
    for (const topicFile of story.topics) {
      const stories = storiesByTopic.get(topicFile) ?? []
      stories.push(story)
      storiesByTopic.set(topicFile, stories)
    }
  }
}

const topicFiles = (await readdir(topicsDirectory)).filter((name) => name.endsWith(".md"))

for (const topicFile of topicFiles) {
  const topicPath = path.join(topicsDirectory, topicFile)
  const original = await readFile(topicPath, "utf8")
  const base = removeGeneratedSection(original)
  const stories = (storiesByTopic.get(topicFile) ?? []).sort(
    (a, b) => b.date.localeCompare(a.date),
  )

  if (stories.length === 0) {
    await writeFile(topicPath, base + "\n", "utf8")
    continue
  }

  const renderedStories = stories
    .map(
      ({ date, headline, excerpt }) =>
        `### ${headline}\n\n` +
        `*${date} · [Open the complete daily briefing](../News/Daily/${date}.md)*\n\n` +
        excerpt,
    )
    .join("\n\n---\n\n")

  const generated =
    `${generatedStart}\n\n## Referenced stories\n\n` +
    `${renderedStories}\n\n${generatedEnd}\n`

  await writeFile(topicPath, `${base}\n\n${generated}`, "utf8")
}

const renderedCount = [...storiesByTopic.values()].reduce(
  (total, stories) => total + stories.length,
  0,
)
console.log(
  `Added ${renderedCount} referenced story excerpt(s) across ${storiesByTopic.size} topic page(s).`,
)
