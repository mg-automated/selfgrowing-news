#!/usr/bin/env node

import { readFile } from "node:fs/promises"
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

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must use YYYY-MM-DD")

const document = JSON.parse(await readFile(outlooksPath, "utf8"))
const maximumSupplementalReviews = document.settings?.maximumSupplementalReviews ?? 6
const maximumNewOutlooksPerRun = document.settings?.maximumNewOutlooksPerRun ?? 2
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

const addDays = (value, days) => {
  const result = new Date(`${value}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
const expiryWindow = addDays(date, document.settings?.expiryReviewLeadDays ?? 3)
const required = []
const supplemental = []
const creationCandidates = []

for (const topicFile of [...linkedToday].sort()) {
  if (!(topicFile in (document.outlooks ?? {}))) {
    creationCandidates.push({
      topicFile,
      action: "consider-create",
      reasons: ["linked from today's briefing and has no outlook"],
    })
  }
}

for (const [topicFile, outlook] of Object.entries(document.outlooks ?? {})) {
  const reasons = []
  const isLinkedToday = linkedToday.has(topicFile)
  if (isLinkedToday) reasons.push("linked from today's briefing")
  if (outlook.nextReview <= date) reasons.push(`review due ${outlook.nextReview}`)
  if (outlook.validUntil <= expiryWindow) reasons.push(`validity ends ${outlook.validUntil}`)

  for (const event of outlook.upcomingEvents ?? []) {
    if (event.reviewFrom <= date) {
      reasons.push(event.date < date ? `event outcome overdue: ${event.date}` : `event review window open: ${event.date}`)
    }
  }

  if (reasons.length === 0) continue
  const candidate = { topicFile, action: "review", reasons }
  if (isLinkedToday) required.push(candidate)
  else supplemental.push(candidate)
}

supplemental.sort((a, b) => {
  const aOutlook = document.outlooks[a.topicFile]
  const bOutlook = document.outlooks[b.topicFile]
  return aOutlook.nextReview.localeCompare(bOutlook.nextReview) || a.topicFile.localeCompare(b.topicFile)
})

const selectedSupplemental = supplemental.slice(0, maximumSupplementalReviews)
const deferred = supplemental.slice(maximumSupplementalReviews)
const creationOffset = creationCandidates.length
  ? Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000) % creationCandidates.length
  : 0
const rotatedCreationCandidates = [
  ...creationCandidates.slice(creationOffset),
  ...creationCandidates.slice(0, creationOffset),
]
const selectedCreationCandidates = rotatedCreationCandidates.slice(0, maximumNewOutlooksPerRun)
const deferredCreationCandidates = rotatedCreationCandidates.slice(maximumNewOutlooksPerRun)
const output = {
  date,
  linkedTopicsToday: [...linkedToday].sort(),
  selected: [...required, ...selectedSupplemental, ...selectedCreationCandidates],
  deferred: [...deferred, ...deferredCreationCandidates],
  skippedOutlooks: Object.keys(document.outlooks ?? {}).length - required.length - supplemental.length,
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
