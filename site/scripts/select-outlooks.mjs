#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const repositoryRoot = path.resolve(option("--root", "."))
const date = option("--date", new Date().toISOString().slice(0, 10))
const outlooksPath = path.join(repositoryRoot, "Data", "topic-outlooks.json")
const dailyPath = path.join(repositoryRoot, "News", "Daily", `${date}.md`)
const dailyDirectory = path.dirname(dailyPath)

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must use YYYY-MM-DD")

const document = JSON.parse(await readFile(outlooksPath, "utf8"))
const maximumResearchPerRun = document.settings?.maximumOutlookResearchPerRun ?? 4
const maximumCandidateChecks = document.settings?.maximumCandidateChecksPerRun ?? 2
const maximumNewOutlooksPerRun = document.settings?.maximumNewOutlooksPerRun ?? 1
const expiryReviewLeadDays = document.settings?.expiryReviewLeadDays ?? 3
let dailyMarkdown = ""
try {
  dailyMarkdown = await readFile(dailyPath, "utf8")
} catch (error) {
  if (error.code !== "ENOENT") throw error
}

const linkedToday = new Set()
for (const match of dailyMarkdown.matchAll(/\[[^\]]+\]\(\.\.\/\.\.\/Topics\/([^\s)#]+\.md)(?:#[^)]*)?\)/g)) {
  linkedToday.add(decodeURIComponent(match[1]))
}

const archivedTopicStats = new Map()
for (const filename of (await readdir(dailyDirectory)).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort()) {
  const markdown = await readFile(path.join(dailyDirectory, filename), "utf8")
  const linkedInFile = new Set()
  for (const match of markdown.matchAll(/\[[^\]]+\]\(\.\.\/\.\.\/Topics\/([^\s)#]+\.md)(?:#[^)]*)?\)/g)) {
    linkedInFile.add(decodeURIComponent(match[1]))
  }
  for (const topicFile of linkedInFile) {
    const fileDate = filename.slice(0, 10)
    const stats = archivedTopicStats.get(topicFile)
    if (!stats) archivedTopicStats.set(topicFile, { firstSeen: fileDate, lastSeen: fileDate, mentions: 1 })
    else {
      stats.lastSeen = fileDate
      stats.mentions += 1
    }
  }
}

const addDays = (value, days) => {
  const result = new Date(`${value}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
const expiryWindow = addDays(date, expiryReviewLeadDays)

document.candidates ??= {}
for (const topicFile of Object.keys(document.candidates)) {
  if (topicFile in (document.outlooks ?? {})) delete document.candidates[topicFile]
}
for (const topicFile of [...linkedToday].sort()) {
  if (topicFile in (document.outlooks ?? {})) continue
  const candidate = document.candidates[topicFile]
  if (!candidate) {
    const archived = archivedTopicStats.get(topicFile) ?? { firstSeen: date, lastSeen: date, mentions: 1 }
    document.candidates[topicFile] = {
      ...archived,
      attempts: 0,
      lastAttempt: null,
      eligibleAfter: date,
    }
  } else if (candidate.lastSeen !== date) {
    candidate.lastSeen = date
    candidate.mentions = (candidate.mentions ?? 0) + 1
  }
  if ((candidate.attempts ?? 0) === 0 && candidate.lastAttempt === null) {
    Object.assign(candidate, archivedTopicStats.get(topicFile) ?? {})
  }
}

const reviews = []
for (const [topicFile, outlook] of Object.entries(document.outlooks ?? {})) {
  const reasons = []
  const isLinkedToday = linkedToday.has(topicFile)
  let eventReviewOpen = false
  if (isLinkedToday) reasons.push("linked from today's briefing")
  if (outlook.nextReview <= date) reasons.push(`review due ${outlook.nextReview}`)
  if (outlook.validUntil <= expiryWindow) reasons.push(`validity ends ${outlook.validUntil}`)

  for (const event of outlook.upcomingEvents ?? []) {
    if (event.reviewFrom <= date) {
      eventReviewOpen = true
      reasons.push(event.date < date ? `event outcome overdue: ${event.date}` : `event review window open: ${event.date}`)
    }
  }

  if (reasons.length === 0) continue
  reviews.push({
    topicFile,
    action: "review",
    reasons,
    priority: isLinkedToday ? 0 : eventReviewOpen ? 1 : outlook.nextReview <= date ? 2 : 3,
    nextReview: outlook.nextReview,
  })
}

reviews.sort((a, b) =>
  a.priority - b.priority || a.nextReview.localeCompare(b.nextReview) || a.topicFile.localeCompare(b.topicFile),
)

const selectedReviews = reviews.slice(0, maximumResearchPerRun)
const deferredReviews = reviews.slice(maximumResearchPerRun)
const remainingResearchSlots = Math.max(0, maximumResearchPerRun - selectedReviews.length)

const eligibleCandidates = Object.entries(document.candidates)
  .filter(([, candidate]) => (candidate.eligibleAfter ?? candidate.firstSeen) <= date)
  .map(([topicFile, candidate]) => ({
    topicFile,
    action: "consider-create",
    reasons: [
      linkedToday.has(topicFile) ? "linked from today's briefing and has no outlook" : "persisted candidate without an outlook",
      `${candidate.mentions ?? 0} archived briefing mention${candidate.mentions === 1 ? "" : "s"}`,
      `${candidate.attempts ?? 0} previous evaluation attempt${candidate.attempts === 1 ? "" : "s"}`,
    ],
    linkedToday: linkedToday.has(topicFile),
    ...candidate,
  }))

eligibleCandidates.sort((a, b) =>
  (b.mentions ?? 0) - (a.mentions ?? 0) ||
  Number(b.linkedToday) - Number(a.linkedToday) ||
  b.lastSeen.localeCompare(a.lastSeen) ||
  (a.attempts ?? 0) - (b.attempts ?? 0) ||
  a.topicFile.localeCompare(b.topicFile),
)

const candidateLimit = Math.min(maximumCandidateChecks, remainingResearchSlots)
const selectedCandidates = eligibleCandidates.slice(0, candidateLimit)
const selectedCandidateNames = new Set(selectedCandidates.map((candidate) => candidate.topicFile))
const deferredCandidates = Object.entries(document.candidates)
  .filter(([topicFile]) => !selectedCandidateNames.has(topicFile))
  .map(([topicFile, candidate]) => ({
    topicFile,
    action: "consider-create",
    reasons: [
      (candidate.eligibleAfter ?? candidate.firstSeen) > date
        ? `cooldown until ${candidate.eligibleAfter}`
        : "research limit reached",
    ],
  }))

await writeFile(outlooksPath, `${JSON.stringify(document, null, 2)}\n`)

const cleanReview = ({ priority, nextReview, ...candidate }) => candidate
const cleanCandidate = ({ linkedToday: ignored, firstSeen, lastSeen, mentions, attempts, lastAttempt, eligibleAfter, ...candidate }) => candidate
const output = {
  date,
  limits: {
    maximumOutlookResearchPerRun: maximumResearchPerRun,
    maximumCandidateChecksPerRun: maximumCandidateChecks,
    maximumNewOutlooksPerRun,
  },
  linkedTopicsToday: [...linkedToday].sort(),
  selected: [
    ...selectedReviews.map(cleanReview),
    ...selectedCandidates.map(cleanCandidate),
  ],
  deferred: [
    ...deferredReviews.map(cleanReview),
    ...deferredCandidates,
  ],
  skippedOutlooks: Object.keys(document.outlooks ?? {}).length - reviews.length,
  queuedCandidates: Object.keys(document.candidates).length,
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
