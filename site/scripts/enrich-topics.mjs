#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const contentRoot = path.resolve(process.argv[2] ?? "content")
const outlooksPath = path.resolve(process.argv[3] ?? "Data/topic-outlooks.json")
const dailyDirectory = path.join(contentRoot, "News", "Daily")
const topicsDirectory = path.join(contentRoot, "Topics")
const generatedStart = "<!-- generated-topic-stories:start -->"
const generatedEnd = "<!-- generated-topic-stories:end -->"
const visibleTimelineEntries = 3

function validateIsoDate(value, field, topicFile) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${topicFile}: ${field} must be a valid YYYY-MM-DD date`)
  }
}

function validateUrl(value, field, topicFile) {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) throw new Error()
  } catch {
    throw new Error(`${topicFile}: ${field} must be an HTTP(S) URL`)
  }
}

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

function renderOutlook(outlook, topicFile, archiveDate) {
  for (const field of ["reviewed", "materiallyUpdated", "validUntil"]) {
    validateIsoDate(outlook[field], field, topicFile)
  }
  if (!["low", "medium", "high"].includes(outlook.confidence)) {
    throw new Error(`${topicFile}: confidence must be low, medium, or high`)
  }
  if (!outlook.assessment?.trim()) throw new Error(`${topicFile}: assessment is required`)

  const events = outlook.upcomingEvents ?? []
  for (const [index, event] of events.entries()) {
    validateIsoDate(event.date, `upcomingEvents[${index}].date`, topicFile)
    validateUrl(event.source?.url, `upcomingEvents[${index}].source.url`, topicFile)
  }
  for (const [index, source] of (outlook.sources ?? []).entries()) {
    validateUrl(source.url, `sources[${index}].url`, topicFile)
  }

  const stale = archiveDate > outlook.validUntil
  const confidence = outlook.confidence[0].toUpperCase() + outlook.confidence.slice(1)
  const likelyDevelopments = (outlook.likelyDevelopments ?? [])
    .map((item) => `<li>${renderInline(item)}</li>`)
    .join("")
  const renderedEvents = events
    .map(
      (event) =>
        `<li><strong>${escapeHtml(event.date)}:</strong> ${renderInline(event.description)} ` +
        `<a class="external" href="${escapeHtml(event.source.url)}">${escapeHtml(event.source.label)}</a></li>`,
    )
    .join("")
  const changeSignals = (outlook.changeSignals ?? [])
    .map((item) => `<li>${renderInline(item)}</li>`)
    .join("")
  const sources = (outlook.sources ?? [])
    .map((source) => `<a class="external" href="${escapeHtml(source.url)}">${escapeHtml(source.label)}</a>`)
    .join(" · ")

  return (
    `<section class="topic-outlook${stale ? " is-stale" : ""}" aria-labelledby="topic-outlook-title">\n` +
    `<div class="topic-outlook-heading"><div><h2 id="topic-outlook-title">Outlook</h2>` +
    `<p>AI-assisted assessment for ${escapeHtml(outlook.horizon ?? "the next 30 days")}</p></div>` +
    `<span class="topic-outlook-confidence">${escapeHtml(confidence)} confidence</span></div>\n` +
    (stale
      ? `<p class="topic-outlook-warning"><strong>Awaiting review:</strong> This outlook expired on ${escapeHtml(outlook.validUntil)} and should not be treated as current.</p>\n`
      : "") +
    `<p>${renderInline(outlook.assessment)}</p>\n` +
    `<div class="topic-outlook-meta"><span>Reviewed ${escapeHtml(outlook.reviewed)}</span>` +
    `<span>Valid through ${escapeHtml(outlook.validUntil)}</span></div>\n` +
    `<details class="topic-outlook-details"><summary>Show detailed outlook</summary>\n` +
    (likelyDevelopments ? `<h3>Most likely developments</h3><ul>${likelyDevelopments}</ul>\n` : "") +
    (renderedEvents ? `<h3>Known upcoming events</h3><ul>${renderedEvents}</ul>\n` : "") +
    (changeSignals ? `<h3>Signals that could change this outlook</h3><ul>${changeSignals}</ul>\n` : "") +
    (sources ? `<p class="topic-outlook-sources"><strong>Sources:</strong> ${sources}</p>\n` : "") +
    `</details>\n</section>`
  )
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
const outlookDocument = JSON.parse(await readFile(outlooksPath, "utf8"))
if (outlookDocument.version !== 1 || typeof outlookDocument.outlooks !== "object") {
  throw new Error("Data/topic-outlooks.json must use schema version 1 and contain an outlooks object")
}
const outlooks = outlookDocument.outlooks

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

  const outlook = outlooks[topicFile]
  const renderedOutlook = outlook ? `${renderOutlook(outlook, topicFile, archiveDate)}\n\n` : ""

  if (stories.length === 0) {
    const generated = outlook
      ? `${generatedStart}\n\n${renderedOutlook}${generatedEnd}\n`
      : ""
    await writeFile(topicPath, `${base}${generated ? `\n\n${generated}` : "\n"}`, "utf8")
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
    renderedOutlook +
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
console.log(`Rendered ${Object.keys(outlooks).length} structured topic outlook(s).`)
