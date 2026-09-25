#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const dailyDirectory = path.join(contentRoot, "News", "Daily")
const topicsDirectory = path.join(contentRoot, "Topics")
const generatedStart = "<!-- generated-topic-stories:start -->"
const generatedEnd = "<!-- generated-topic-stories:end -->"
const visibleTimelineEntries = 3

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function renderInline(markdown) {
  const tokens = []
  const tokenized = markdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const token = `\u0000${tokens.length}\u0000`
      const external = /^https?:\/\//.test(href)
      tokens.push(
        `<a href="${escapeHtml(href)}"${external ? ' class="external"' : ' class="internal"'}>${escapeHtml(label)}</a>`,
      )
      return token
    })
    .replace(/\*\*([^*]+)\*\*/g, (_match, content) => {
      const token = `\u0000${tokens.length}\u0000`
      tokens.push(`<strong>${escapeHtml(content)}</strong>`)
      return token
    })

  return escapeHtml(tokenized).replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)])
}

function renderExcerpt(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${renderInline(block.replace(/\r?\n/g, " "))}</p>`)
    .join("\n")
}

function utcDay(date) {
  return new Date(`${date}T00:00:00Z`)
}

function dayDifference(later, earlier) {
  return Math.round((utcDay(later) - utcDay(earlier)) / 86_400_000)
}

function renderMomentum(stories, archiveDate) {
  const counts = Array.from({ length: 30 }, () => 0)

  for (const story of stories) {
    const age = dayDifference(archiveDate, story.date)
    if (age >= 0 && age < counts.length) {
      counts[counts.length - 1 - age] += 1
    }
  }

  const maximum = Math.max(1, ...counts)
  const currentWeek = counts.slice(-7).reduce((sum, count) => sum + count, 0)
  const previousWeek = counts.slice(-14, -7).reduce((sum, count) => sum + count, 0)
  const status = currentWeek > previousWeek ? "Rising" : currentWeek < previousWeek ? "Cooling" : "Steady"
  const symbol = status === "Rising" ? "↑" : status === "Cooling" ? "↓" : "→"
  const recentCount = counts.reduce((sum, count) => sum + count, 0)
  const bars = counts
    .map((count, index) => {
      const date = utcDay(archiveDate)
      date.setUTCDate(date.getUTCDate() - (counts.length - 1 - index))
      const dateLabel = date.toISOString().slice(0, 10)

      return (
        `<span class="topic-momentum-bar${count > 0 ? " has-stories" : ""}" ` +
        `style="--activity: ${Math.max(count / maximum, 0.08)}" ` +
        `title="${dateLabel}: ${count} ${count === 1 ? "story" : "stories"}"></span>`
      )
    })
    .join("")

  return (
    `<section class="topic-momentum" aria-labelledby="topic-momentum-title">\n` +
    `<div class="topic-momentum-heading">\n` +
    `<div><h2 id="topic-momentum-title">Topic momentum</h2>` +
    `<p>Coverage activity during the 30 days ending ${archiveDate}</p></div>\n` +
    `<div class="topic-momentum-status"><span>${symbol} ${status}</span>` +
    `<strong>${recentCount} ${recentCount === 1 ? "story" : "stories"}</strong></div>\n` +
    `</div>\n` +
    `<div class="topic-momentum-chart" role="img" aria-label="${recentCount} referenced stories in the past 30 days">${bars}</div>\n` +
    `<div class="topic-momentum-axis"><span>30 days ago</span><span>${archiveDate}</span></div>\n` +
    `<p class="topic-momentum-comparison">${currentWeek} ${currentWeek === 1 ? "story" : "stories"} in the past 7 days, compared with ${previousWeek} in the previous 7 days.</p>\n` +
    `</section>`
  )
}

function renderTimelineEntry(story, index) {
  return (
    `<article class="topic-timeline-entry${index === 0 ? " is-latest" : ""}">\n` +
    `<div class="topic-timeline-date"><time datetime="${story.date}">${story.date}</time></div>\n` +
    `<div class="topic-timeline-marker" aria-hidden="true"><span></span></div>\n` +
    `<div class="topic-timeline-content">\n` +
    `${index === 0 ? '<div class="topic-timeline-label">Latest development</div>\n' : ""}` +
    `<h3>${escapeHtml(story.headline)}</h3>\n` +
    `${renderExcerpt(story.excerpt)}\n` +
    `<p class="topic-timeline-daily-link"><a class="internal" href="../News/Daily/${story.date}.md">Open the complete daily briefing →</a></p>\n` +
    `</div>\n` +
    `</article>`
  )
}

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
const archiveDate = dailyFiles.at(-1)?.slice(0, -3)

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

  const visibleStories = stories.slice(0, visibleTimelineEntries)
  const earlierStories = stories.slice(visibleTimelineEntries)
  const renderedVisibleStories = visibleStories
    .map((story, index) => renderTimelineEntry(story, index))
    .join("\n")
  const renderedEarlierStories = earlierStories.length
    ? `<details class="topic-timeline-earlier">\n` +
      `<summary>Show ${earlierStories.length} earlier ${earlierStories.length === 1 ? "development" : "developments"}</summary>\n` +
      earlierStories
        .map((story, index) => renderTimelineEntry(story, index + visibleTimelineEntries))
        .join("\n") +
      `\n</details>\n`
    : ""

  const generated =
    `${generatedStart}\n\n` +
    `${renderMomentum(stories, archiveDate)}\n\n` +
    `<section class="topic-timeline" aria-labelledby="topic-timeline-title">\n` +
    `<div class="topic-timeline-heading"><div><h2 id="topic-timeline-title">How the story developed</h2>` +
    `<p>Material developments linked from daily briefings</p></div>` +
    `<span>${stories.length} ${stories.length === 1 ? "reference" : "references"}</span></div>\n` +
    `${renderedVisibleStories}\n${renderedEarlierStories}</section>\n\n` +
    `${generatedEnd}\n`

  await writeFile(topicPath, `${base}\n\n${generated}`, "utf8")
}

const renderedCount = [...storiesByTopic.values()].reduce(
  (total, stories) => total + stories.length,
  0,
)
console.log(
  `Added ${renderedCount} timeline entr${renderedCount === 1 ? "y" : "ies"} across ${storiesByTopic.size} topic page(s).`,
)
