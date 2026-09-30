import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const results = ['supported', 'partly-supported', 'not-supported', 'unverifiable']
export const labels = { pending: 'Pending', supported: 'Supported', 'partly-supported': 'Partly supported', 'not-supported': 'Not supported', unverifiable: 'Unverifiable' }
const fail = message => { throw new Error(message) }
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('Invalid calendar date')
  return value
}
const text = value => typeof value === 'string' && value.trim().length > 0
function sources(items) {
  if (!Array.isArray(items) || !items.length) fail('Sources are required')
  for (const source of items) {
    if (!text(source.label) || !/^https?:$/.test(new URL(source.url).protocol)) fail('Invalid source')
  }
}
export function validate(document) {
  if (document.version !== 1 || typeof document.settings?.enabled !== 'boolean' || !Array.isArray(document.predictions)) fail('Invalid prediction document')
  const s = document.settings
  for (const key of ['maximumTrackedTopics', 'maximumActivePerTopic', 'maximumAssessmentsPerRun', 'maximumCreationsPerRun', 'minimumDaysBetweenPredictions']) {
    if (!Number.isInteger(s[key]) || s[key] < 0) fail('Invalid limit: ' + key)
  }
  if (!Array.isArray(s.topics) || new Set(s.topics).size !== s.topics.length || s.topics.length > s.maximumTrackedTopics || s.topics.some(t => !/^[A-Za-z0-9-]+\.md$/.test(t))) fail('Invalid tracked topics')
  const ids = new Set()
  for (const p of document.predictions) {
    if (!text(p.id) || ids.has(p.id)) fail('Duplicate or missing prediction ID')
    ids.add(p.id)
    if (!/^[A-Za-z0-9-]+\.md$/.test(p.topicFile)) fail('Invalid topic filename')
    date(p.created); date(p.deadline)
    if (p.deadline <= p.created) fail('Deadline must follow creation')
    for (const field of ['statement', 'successCondition', 'failureCondition']) if (!text(p[field])) fail('Missing ' + field)
    if (!['low', 'medium', 'high'].includes(p.confidence)) fail('Invalid confidence')
    if (!text(p.outlookSnapshot?.assessment)) fail('Original outlook snapshot required')
    date(p.outlookSnapshot.reviewed)
    if (p.outlookSnapshot.reviewed > p.created) fail('Future outlook snapshot')
    sources(p.sources)
    if (p.assessment) {
      const a = p.assessment
      date(a.assessed); date(a.evidenceThrough)
      if (!results.includes(a.result) || !text(a.explanation) || a.assessed < p.created || a.evidenceThrough < p.created || a.evidenceThrough > a.assessed) fail('Invalid assessment')
      if (a.result === 'partly-supported' && !text(p.partialCondition)) fail('Partial result requires original partial condition')
      if (['not-supported', 'unverifiable'].includes(a.result) && a.assessed <= p.deadline) fail('Wait until the deadline day has ended before a negative or unverifiable verdict')
      if (a.result !== 'unverifiable' && a.evidenceThrough > p.deadline) fail('Only evidence within the prediction window can determine the outcome')
      sources(a.sources)
    }
  }
  return document
}
export function select(document, outlooks, markdown, today) {
  date(today); validate(document)
  if (!document.settings.enabled) return { date: today, enabled: false, assessments: [], creations: [], deferred: [] }
  const s = document.settings
  const linked = new Set([...markdown.matchAll(/Topics\/([^\s)#]+\.md)/g)].map(m => decodeURIComponent(m[1])))
  const pending = document.predictions.filter(p => !p.assessment && p.created <= today)
  const candidates = pending.filter(p => today >= p.deadline || linked.has(p.topicFile)).sort((a,b) => Number(today < a.deadline) - Number(today < b.deadline) || a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id))
  const assessments = candidates.slice(0, Math.max(0, s.maximumAssessmentsPerRun - document.predictions.filter(p=>p.assessment?.assessed === today).length)).map(p => ({ id: p.id, topicFile: p.topicFile, reason: today >= p.deadline ? 'deadline reached' : 'new coverage; assess only if conclusive' }))
  const creations = s.topics.filter(topic => {
    const o = outlooks.outlooks?.[topic]
    const previous = document.predictions.filter(p => p.topicFile === topic).sort((a,b) => b.created.localeCompare(a.created))[0]
    const age = previous ? (new Date(today) - new Date(previous.created)) / 86400000 : Infinity
    return o?.reviewed === today && o.validUntil > today && pending.filter(p => p.topicFile === topic).length < s.maximumActivePerTopic && age >= s.minimumDaysBetweenPredictions
  }).slice(0, Math.max(0, s.maximumCreationsPerRun - document.predictions.filter(p=>p.created === today).length)).map(topicFile => ({topicFile, reason: 'outlook verified today; use existing research only'}))
  return { date: today, enabled: true, assessments, creations, deferred: candidates.slice(s.maximumAssessmentsPerRun).map(p=>p.id) }
}
export function applyBatch(document, outlooks, markdown, batch) {
  const plan = select(document, outlooks, markdown, batch.date)
  if (!plan.enabled) fail('Prediction tracking is paused; no changes allowed')
  const updated = structuredClone(document)
  const additions = batch.additions ?? [], assessments = batch.assessments ?? []
  if (additions.length > plan.creations.length || assessments.length > plan.assessments.length) fail('Per-run limit exceeded')
  const usedTopics = new Set(), usedIDs = new Set()
  for (const p of additions) {
    if (usedTopics.has(p.topicFile) || !plan.creations.some(c=>c.topicFile === p.topicFile) || p.created !== batch.date || p.assessment) fail('Unselected or invalid creation')
    usedTopics.add(p.topicFile)
    if (JSON.stringify(p.outlookSnapshot) !== JSON.stringify(outlooks.outlooks[p.topicFile])) fail('Snapshot must exactly preserve the current outlook')
    updated.predictions.push(structuredClone(p))
  }
  for (const change of assessments) {
    if (usedIDs.has(change.id) || !plan.assessments.some(a=>a.id === change.id) || change.assessment?.assessed !== batch.date) fail('Unselected or invalid assessment')
    usedIDs.add(change.id)
    updated.predictions.find(p=>p.id === change.id).assessment = structuredClone(change.assessment)
  }
  // Budget applies to the entire day, including repeated invocations.
  if (updated.predictions.filter(p=>p.created === batch.date).length > updated.settings.maximumCreationsPerRun || updated.predictions.filter(p=>p.assessment?.assessed === batch.date).length > updated.settings.maximumAssessmentsPerRun) fail('Daily limit exceeded')
  validate(updated)
  return updated
}
export async function run(args) {
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key)+1] : fallback
  const root = path.resolve(option('--root', '.'))
  const file = path.join(root, 'Data/prediction-tracking.json')
  const document = validate(JSON.parse(await readFile(file, 'utf8')))
  if (args.includes('--validate')) return 'Prediction tracking data valid'
  // Exit before reading outlooks, briefings or performing any research when disabled.
  if (!document.settings.enabled) return JSON.stringify({enabled:false, assessments:[], creations:[]})
  const outlooks = JSON.parse(await readFile(path.join(root, 'Data/topic-outlooks.json'), 'utf8'))
  const today = date(option('--date', new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Zurich'}).format(new Date())))
  let markdown = ''
  try { markdown = await readFile(path.join(root, 'News/Daily', today + '.md'), 'utf8') } catch(e) { if(e.code !== 'ENOENT') throw e }
  if (args.includes('--apply')) {
    const batch = JSON.parse(await readFile(option('--apply'), 'utf8'))
    if(batch.date !== today) fail('Batch date must match run date')
    const updated = applyBatch(document, outlooks, markdown, batch)
    await writeFile(file, JSON.stringify(updated, null, 2) + '\n')
    return 'Prediction changes validated and saved'
  } else return JSON.stringify(select(document, outlooks, markdown, today), null, 2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await run(process.argv.slice(2)))
