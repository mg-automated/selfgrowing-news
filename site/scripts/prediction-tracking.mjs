import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
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
  if (document.version !== 2 || typeof document.settings?.enabled !== 'boolean' || !Array.isArray(document.predictions) || !Array.isArray(document.attempts)) fail('Invalid prediction document; version 2 required')
  const s = document.settings
  for (const key of ['maximumTrackedTopics', 'maximumActivePerTopic', 'maximumAssessmentsPerRun', 'maximumCreationsPerRun', 'minimumDaysBetweenPredictions']) {
    if (!Number.isInteger(s[key]) || s[key] < 0) fail('Invalid limit: ' + key)
  }
  for (const [key, ceiling] of Object.entries({maximumAssessmentAttemptsPerDay:2, maximumCreationAttemptsPerDay:2, maximumAdditionalLookupsPerAssessment:3})) {
    if (s[key] !== undefined && (!Number.isInteger(s[key]) || s[key] < 0 || s[key] > ceiling)) fail('Invalid tracking budget: ' + key)
  }
  if (!Array.isArray(s.topics) || new Set(s.topics).size !== s.topics.length || s.topics.length > s.maximumTrackedTopics || s.topics.some(t => !/^[A-Za-z0-9-]+\.md$/.test(t))) fail('Invalid tracked topics')
  const ids = new Set()
  for (const p of document.predictions) {
    if (!text(p.id) || ids.has(p.id)) fail('Duplicate or missing prediction ID')
    ids.add(p.id)
    if (!/^[A-Za-z0-9-]+\.md$/.test(p.topicFile)) fail('Invalid topic filename')
    date(p.created); date(p.deadline)
    if (p.deadline <= p.created) fail('Deadline must follow creation')
    if (!['event', 'persistence'].includes(p.kind)) fail('Prediction kind must be event or persistence')
    for (const field of ['statement', 'successCondition', 'failureCondition']) if (!text(p[field])) fail('Missing ' + field)
    if (!['low', 'medium', 'high'].includes(p.confidence)) fail('Invalid confidence')
    if (!text(p.outlookSnapshot?.assessment)) fail('Original outlook snapshot required')
    date(p.outlookSnapshot.reviewed)
    if (p.outlookSnapshot.reviewed > p.created) fail('Future outlook snapshot')
    date(p.outlookSnapshot.validUntil)
    if (p.deadline > p.outlookSnapshot.validUntil) fail('Deadline exceeds original Outlook horizon')
    sources(p.sources)
    if (p.assessment) {
      validateAssessment(p, p.assessment)
    }
    const correctionIDs = new Set()
    let lastCorrection = p.assessment?.assessed ?? p.created
    if (p.corrections !== undefined && !Array.isArray(p.corrections)) fail('Invalid corrections')
    for (const c of p.corrections ?? []) {
      if (!p.assessment || !text(c.id) || correctionIDs.has(c.id) || !text(c.reason)) fail('Correction requires a final assessment, unique ID and reason')
      correctionIDs.add(c.id); date(c.corrected)
      if (c.corrected < lastCorrection) fail('Corrections must be chronological')
      lastCorrection = c.corrected; sources(c.sources)
      if (c.assessment) {
        if (c.assessment.assessed !== c.corrected) fail('Correction assessment date must match correction date')
        validateAssessment(p, c.assessment)
      }
    }
  }
  validateAttempts(document)
  return document
}
const budgetLimits = {assessmentAttempts:2, creationAttempts:2, assessments:2, creations:1, additionalLookups:3}
function configuredBudget(s) {
  return {assessmentAttempts:s.maximumAssessmentAttemptsPerDay ?? 2, creationAttempts:s.maximumCreationAttemptsPerDay ?? 2, assessments:Math.min(2,s.maximumAssessmentsPerRun), creations:Math.min(1,s.maximumCreationsPerRun), additionalLookups:s.maximumAdditionalLookupsPerAssessment ?? 3}
}
function recordedBudget(document, today) {
  return document.attempts.find(a => a.date === today)?.budget ?? configuredBudget(document.settings)
}
function availableBudget(document, today) {
  const original = recordedBudget(document,today), current = configuredBudget(document.settings)
  return Object.fromEntries(Object.keys(budgetLimits).map(key => [key,Math.min(original[key],current[key])]))
}
function validateAttempts(document) {
  const ids = new Set(), subjects = new Set(), days = new Map()
  const predictions = new Map(document.predictions.map(p=>[p.id,p])), creationsByDay = new Map(), assessmentsByDay = new Map()
  for (const p of document.predictions) {
    creationsByDay.set(p.created,(creationsByDay.get(p.created) ?? 0)+1)
    if (p.assessment) assessmentsByDay.set(p.assessment.assessed,(assessmentsByDay.get(p.assessment.assessed) ?? 0)+1)
  }
  for (const a of document.attempts) {
    if (!text(a.id) || ids.has(a.id) || !['assessment','creation'].includes(a.kind)) fail('Invalid or duplicate attempt')
    ids.add(a.id);date(a.date)
    for (const [key, ceiling] of Object.entries(budgetLimits)) if (!Number.isInteger(a.budget?.[key]) || a.budget[key] < 0 || a.budget[key] > ceiling) fail('Invalid reserved budget')
    const subject = a.kind === 'assessment' ? a.predictionId : a.topicFile
    const p = predictions.get(a.predictionId)
    if (a.kind === 'assessment' && (!p || a.date < p.created)) fail('Invalid assessment attempt target')
    if (a.kind === 'assessment' && p.assessment && a.date > p.assessment.assessed) fail('Attempt cannot follow a final assessment')
    if (a.kind === 'creation' && !/^[A-Za-z0-9-]+\.md$/.test(a.topicFile)) fail('Invalid creation attempt target')
    if (!Number.isInteger(a.lookupLimit) || a.lookupLimit < 0 || a.lookupLimit > a.budget.additionalLookups || (a.kind === 'creation' && a.lookupLimit !== 0) || (a.kind === 'assessment' && a.date < p.deadline && a.lookupLimit !== 0)) fail('Invalid reserved source lookup allowance')
    const key = `${a.date}:${a.kind}:${subject}`
    if (subjects.has(key)) fail('Duplicate daily attempt for subject')
    subjects.add(key)
    let day = days.get(a.date)
    if (!day) {day={budget:a.budget,assessment:0,creation:0};days.set(a.date,day)}
    if (canonical(day.budget) !== canonical(a.budget)) fail('Daily reservations must share their original budget')
    day[a.kind]++
    if (a.outcome) {
      const o = a.outcome, statuses = a.kind === 'assessment' ? ['pending','assessed','not-needed'] : ['created','skipped','not-needed']
      if (!statuses.includes(o.status) || !text(o.explanation) || !Number.isInteger(o.additionalLookups) || o.additionalLookups < 0 || o.additionalLookups > a.lookupLimit) fail('Invalid attempt outcome or source lookup count')
      if (o.status === 'not-needed' && o.additionalLookups !== 0) fail('Unused attempts cannot report source research')
      if (o.status === 'assessed' && p.assessment?.assessed !== a.date) fail('Assessment outcome requires a matching final assessment')
      const created = predictions.get(o.predictionId)
      if (o.status === 'created' && (!created || created.topicFile !== a.topicFile || created.created !== a.date)) fail('Creation outcome requires a matching prediction')
    }
  }
  for (const [day, counts] of days) {
    if (counts.assessment > counts.budget.assessmentAttempts || counts.creation > counts.budget.creationAttempts || (creationsByDay.get(day) ?? 0) > counts.budget.creations || (assessmentsByDay.get(day) ?? 0) > counts.budget.assessments) fail('Reserved daily budget exceeded')
  }
}
export function validateAssessment(p, a) {
  date(a.assessed); date(a.evidenceThrough)
  if (!results.includes(a.result) || !text(a.explanation) || a.assessed < p.created || a.evidenceThrough < p.created || a.evidenceThrough > a.assessed) fail('Invalid assessment')
  if (a.result === 'partly-supported' && !text(p.partialCondition)) fail('Partial result requires original partial condition')
  if (a.evidenceThrough > p.deadline) fail('Only evidence within the prediction window can determine the outcome')
  const wholeWindow = p.kind === 'persistence' || a.result !== 'supported'
  if (wholeWindow && a.assessed <= p.deadline) fail('Wait until the deadline day has ended before a whole-window verdict')
  if (wholeWindow && a.result !== 'unverifiable' && a.evidenceThrough !== p.deadline) fail('Evidence must cover the full prediction window')
  sources(a.sources)
  return a
}
export function migrate(document) {
  if (document.version === 2) return validate(document)
  if (document.version !== 1 || !Array.isArray(document.predictions) || document.predictions.length) fail('Automatic migration requires empty version 1 history; existing predictions need explicit reviewed migration')
  return validate({...structuredClone(document), version: 2, attempts: []})
}
const canonical = value => JSON.stringify(stable(value))
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}
export function validateHistory(previous, current) {
  const before = previous.version === 1 ? migrate(previous) : validate(previous)
  validate(current)
  const priorPredictions = new Map(before.predictions.map(p=>[p.id,p])), nextPredictions = new Map(current.predictions.map(p=>[p.id,p]))
  const priorAttempts = new Map(before.attempts.map(a=>[a.id,a])), nextAttempts = new Map(current.attempts.map(a=>[a.id,a]))
  const original = p => Object.fromEntries(Object.entries(p).filter(([key]) => !['assessment', 'corrections'].includes(key)))
  for (const old of before.predictions) {
    const next = nextPredictions.get(old.id)
    if (!next) fail('Historical prediction deleted: ' + old.id)
    if (canonical(original(old)) !== canonical(original(next))) fail('Original prediction changed: ' + old.id)
    if (old.assessment && canonical(old.assessment) !== canonical(next.assessment)) fail('Final assessment changed: ' + old.id)
    const priorCorrections = old.corrections ?? [], nextCorrections = next.corrections ?? []
    if (canonical(priorCorrections) !== canonical(nextCorrections.slice(0, priorCorrections.length))) fail('Historical correction changed: ' + old.id)
  }
  for (const old of before.attempts) {
    const next = nextAttempts.get(old.id)
    if (!next) fail('Historical attempt deleted: ' + old.id)
    const reservation = a => Object.fromEntries(Object.entries(a).filter(([key])=>key !== 'outcome'))
    if (canonical(reservation(old)) !== canonical(reservation(next)) || (old.outcome && canonical(old.outcome) !== canonical(next.outcome))) fail('Historical attempt changed: ' + old.id)
  }
  for (const next of current.attempts) if (!priorAttempts.has(next.id) && next.outcome) fail('New attempts must be committed as reservations before completion')
  for (const key of ['maximumAssessmentAttemptsPerDay','maximumCreationAttemptsPerDay','maximumAdditionalLookupsPerAssessment']) if (before.settings[key] !== undefined && current.settings[key] === undefined) fail('Tracking budget settings cannot be removed: ' + key)
  if (current.settings.maximumAssessmentAttemptsPerDay !== undefined) {
    for (const p of current.predictions) {
      const old = priorPredictions.get(p.id)
      const wasReserved = a => priorAttempts.has(a.id) && !priorAttempts.get(a.id).outcome
      if (!old && !current.attempts.some(a=>a.kind === 'creation' && a.topicFile === p.topicFile && a.date === p.created && a.outcome?.status === 'created' && a.outcome.predictionId === p.id && wasReserved(a))) fail('New prediction requires a prior committed creation attempt')
      if (!old?.assessment && p.assessment && !current.attempts.some(a=>a.kind === 'assessment' && a.predictionId === p.id && a.date === p.assessment.assessed && a.outcome?.status === 'assessed' && wasReserved(a))) fail('New assessment requires a prior committed reserved attempt')
    }
  }
  return current
}
export function effectiveAssessment(p) {
  return [...(p.corrections ?? [])].reverse().find(c => c.assessment)?.assessment ?? p.assessment
}
export function appendCorrections(document, batch) {
  validate(document); date(batch.date)
  if (!Array.isArray(batch.corrections) || !batch.corrections.length) fail('Explicit correction batch required')
  const updated = structuredClone(document)
  for (const change of batch.corrections) {
    const p = updated.predictions.find(p => p.id === change.predictionId)
    if (!p?.assessment || change.correction?.corrected !== batch.date) fail('Invalid correction target or date')
    p.corrections ??= []
    p.corrections.push(structuredClone(change.correction))
  }
  return validateHistory(document, updated)
}
export function select(document, outlooks, markdown, today) {
  date(today); validate(document)
  if (!document.settings.enabled) return { date: today, enabled: false, assessments: [], creations: [], deferred: [] }
  const s = document.settings
  const budget = availableBudget(document,today), todayAttempts = document.attempts.filter(a=>a.date === today)
  const linked = new Set([...markdown.matchAll(/Topics\/([^\s)#]+\.md)/g)].map(m => decodeURIComponent(m[1])))
  const pending = document.predictions.filter(p => !p.assessment && p.created <= today)
  const due = pending.filter(p => today > p.deadline || (p.kind === 'event' && (today === p.deadline || linked.has(p.topicFile)))).sort((a,b) => Number(today < a.deadline) - Number(today < b.deadline) || a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id))
  const candidates = due.filter(p=>!todayAttempts.some(a=>a.kind === 'assessment' && a.predictionId === p.id))
  const remainingAssessments = Math.max(0,Math.min(budget.assessmentAttempts - todayAttempts.filter(a=>a.kind === 'assessment').length,budget.assessments - document.predictions.filter(p=>p.assessment?.assessed === today).length))
  const assessments = candidates.slice(0,remainingAssessments).map(p=>({id:p.id,topicFile:p.topicFile,reason:today >= p.deadline ? 'deadline reached' : 'new coverage; assess only if conclusive'}))
  const creationCandidates = s.topics.filter(topic => {
    const o = outlooks.outlooks?.[topic]
    const previous = document.predictions.filter(p => p.topicFile === topic).sort((a,b) => b.created.localeCompare(a.created))[0]
    const age = previous ? (new Date(today) - new Date(previous.created)) / 86400000 : Infinity
    return o?.reviewed === today && o.validUntil > today && pending.filter(p => p.topicFile === topic).length < s.maximumActivePerTopic && age >= s.minimumDaysBetweenPredictions && !todayAttempts.some(a=>a.kind === 'creation' && a.topicFile === topic)
  })
  const lastAttempt = topic => document.attempts.filter(a=>a.kind === 'creation' && a.topicFile === topic).map(a=>a.date).sort().at(-1) ?? ''
  creationCandidates.sort((a,b)=>lastAttempt(a).localeCompare(lastAttempt(b)) || s.topics.indexOf(a)-s.topics.indexOf(b))
  const remainingCreations = document.predictions.filter(p=>p.created === today).length >= budget.creations ? 0 : Math.max(0,budget.creationAttempts-todayAttempts.filter(a=>a.kind === 'creation').length)
  const creations = creationCandidates.slice(0,remainingCreations).map(topicFile=>({topicFile,reason:'outlook verified today; use existing research only'}))
  return {date:today,enabled:true,assessments,creations,deferred:due.filter(p=>!assessments.some(a=>a.id === p.id)).map(p=>p.id),deferredCreations:creationCandidates.slice(creations.length),reserved:todayAttempts.filter(a=>!a.outcome).map(a=>a.id),budget}
}
export function reserveAttempts(document, outlooks, markdown, today) {
  const plan = select(document,outlooks,markdown,today)
  if (!plan.enabled) fail('Prediction tracking is paused; no reservations allowed')
  const updated = structuredClone(document), work = []
  const budget = recordedBudget(document,today)
  for (const a of plan.assessments) work.push({id:`${today}:assessment:${a.id}`,date:today,kind:'assessment',predictionId:a.id,lookupLimit:today >= document.predictions.find(p=>p.id === a.id).deadline ? plan.budget.additionalLookups : 0,budget:structuredClone(budget)})
  for (const c of plan.creations) work.push({id:`${today}:creation:${c.topicFile}`,date:today,kind:'creation',topicFile:c.topicFile,lookupLimit:0,budget:structuredClone(budget)})
  updated.attempts.push(...work)
  return {document:validateHistory(document,updated),work}
}
export function applyBatch(document, outlooks, markdown, batch) {
  if ('corrections' in batch) fail('Corrections require the separate reviewed correction operation')
  const plan = select(document, outlooks, markdown, batch.date)
  if (!plan.enabled) fail('Prediction tracking is paused; no changes allowed')
  const updated = structuredClone(document)
  const additions = batch.additions ?? [], assessments = batch.assessments ?? []
  const reserved = updated.attempts.filter(a=>a.date === batch.date && !a.outcome)
  if (additions.length > plan.budget.creations || assessments.length > plan.budget.assessments) fail('Per-run limit exceeded')
  const usedTopics = new Set(), usedIDs = new Set()
  const finish = (attempt,outcome) => {
    if (!attempt || attempt.outcome) fail('Selected work requires an unused reserved attempt')
    attempt.outcome = structuredClone(outcome)
  }
  for (const p of additions) {
    if (usedTopics.has(p.topicFile) || p.created !== batch.date || p.assessment || p.corrections?.length) fail('Unselected or invalid creation')
    usedTopics.add(p.topicFile)
    if (JSON.stringify(p.outlookSnapshot) !== JSON.stringify(outlooks.outlooks[p.topicFile])) fail('Snapshot must exactly preserve the current outlook')
    if (outlooks.outlooks[p.topicFile]?.reviewed !== batch.date) fail('Creation requires an Outlook verified today')
    const previous = updated.predictions.filter(q=>q.topicFile === p.topicFile)
    if (previous.filter(q=>!q.assessment).length >= updated.settings.maximumActivePerTopic || previous.some(q=>(new Date(batch.date)-new Date(q.created))/86400000 < updated.settings.minimumDaysBetweenPredictions)) fail('Active prediction cap or spacing exceeded')
    finish(reserved.find(a=>a.kind === 'creation' && a.topicFile === p.topicFile),{status:'created',predictionId:p.id,explanation:'Prediction recorded from existing verified Outlook research.',additionalLookups:0})
    updated.predictions.push(structuredClone(p))
  }
  for (const change of assessments) {
    if (usedIDs.has(change.id) || change.assessment?.assessed !== batch.date || updated.predictions.find(p=>p.id === change.id)?.assessment) fail('Unselected or invalid assessment')
    usedIDs.add(change.id)
    finish(reserved.find(a=>a.kind === 'assessment' && a.predictionId === change.id),{status:'assessed',explanation:change.assessment.explanation,additionalLookups:change.additionalLookups})
    updated.predictions.find(p=>p.id === change.id).assessment = structuredClone(change.assessment)
  }
  for (const change of batch.attemptOutcomes ?? []) {
    if (!['pending','skipped','not-needed'].includes(change.status)) fail('Use additions or assessments to record a final outcome')
    finish(reserved.find(a=>a.id === change.attemptId),{status:change.status,explanation:change.explanation,additionalLookups:change.additionalLookups})
  }
  // Budget applies to the entire day, including repeated invocations.
  if (updated.predictions.filter(p=>p.created === batch.date).length > updated.settings.maximumCreationsPerRun || updated.predictions.filter(p=>p.assessment?.assessed === batch.date).length > updated.settings.maximumAssessmentsPerRun) fail('Daily limit exceeded')
  return validateHistory(document, updated)
}
function committedDocument(root) {
  try {
    const top = execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
    if (path.resolve(top) !== root) fail('Tracking root must be the Git repository root')
    const raw = JSON.parse(execFileSync('git',['-C',root,'show','HEAD:Data/prediction-tracking.json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
    return raw.version === 1 ? migrate(raw) : validate(raw)
  } catch (error) {fail('A committed tracking baseline is required: ' + error.message)}
}
async function save(file, document) {
  const temporary = file + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(document,null,2) + '\n',{flag:'wx'})
    await rename(temporary,file)
  } finally {await unlink(temporary).catch(error=>{if(error.code !== 'ENOENT') throw error})}
}
export async function run(args, now = new Date()) {
  if (args.filter(arg=>['--reserve','--apply','--correct','--migrate','--validate'].includes(arg)).length > 1) fail('Choose exactly one tracking operation')
  if (!args.some(arg=>['--reserve','--apply','--correct','--migrate'].includes(arg))) return runInternal(args,now)
  const root = path.resolve(args.includes('--root') ? args[args.indexOf('--root')+1] : '.')
  const lockPath = path.join(root,'Data','.prediction-tracking.lock')
  let lock
  try {lock = await open(lockPath,'wx')} catch (error) {
    if (error.code === 'EEXIST') fail('Another tracking writer is active; do not bypass its lock')
    throw error
  }
  try {return await runInternal(args,now)} finally {await lock.close();await unlink(lockPath)}
}
async function runInternal(args,now) {
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key)+1] : fallback
  const root = path.resolve(option('--root', '.'))
  const file = path.join(root, 'Data/prediction-tracking.json')
  const raw = JSON.parse(await readFile(file, 'utf8'))
  if (args.includes('--migrate')) {
    const migrated = migrate(raw)
    await save(file,migrated)
    return 'Prediction data migrated to version 2; original settings preserved'
  }
  const document = validate(raw)
  if (args.includes('--validate')) return 'Prediction tracking data valid'
  if (args.includes('--correct')) {
    if (!args.includes('--reviewed')) fail('Corrections require --reviewed and an explicit user request; never use during daily runs')
    const batch = JSON.parse(await readFile(option('--correct'), 'utf8'))
    if (batch.date !== new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich'}).format(now)) fail('Correction date must be the actual Zurich run date')
    validateHistory(committedDocument(root),document)
    const updated = appendCorrections(document, batch)
    await save(file,updated)
    return 'Reviewed corrections appended; originals preserved'
  }
  // Exit before reading outlooks, briefings or performing any research when disabled.
  if (!document.settings.enabled) return JSON.stringify({enabled:false, assessments:[], creations:[]})
  const outlooks = JSON.parse(await readFile(path.join(root, 'Data/topic-outlooks.json'), 'utf8'))
  const actualDay = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Zurich'}).format(now)
  const today = date(option('--date',actualDay))
  if ((args.includes('--reserve') || args.includes('--apply')) && today !== actualDay) fail('Tracking writes must use the actual Zurich run date')
  let markdown = ''
  try { markdown = await readFile(path.join(root, 'News/Daily', today + '.md'), 'utf8') } catch(e) { if(e.code !== 'ENOENT') throw e }
  if (args.includes('--reserve')) {
    validateHistory(committedDocument(root),document)
    const reserved = reserveAttempts(document,outlooks,markdown,today)
    if (reserved.work.length) await save(file,reserved.document)
    return JSON.stringify({date:today,work:reserved.work,checkpointRequired:reserved.work.length > 0,instruction:'Commit and push only the tracking data checkpoint before research. Interrupted reservations stay spent; do not retry their research on the same day.'},null,2)
  }
  if (args.includes('--apply')) {
    const batch = JSON.parse(await readFile(option('--apply'), 'utf8'))
    if(batch.date !== today) fail('Batch date must match run date')
    const committed = committedDocument(root)
    validateHistory(committed,document)
    const needed = [
      ...(batch.additions ?? []).map(p=>document.attempts.find(a=>a.kind === 'creation' && a.date === today && a.topicFile === p.topicFile)),
      ...(batch.assessments ?? []).map(c=>document.attempts.find(a=>a.kind === 'assessment' && a.date === today && a.predictionId === c.id)),
      ...(batch.attemptOutcomes ?? []).map(c=>document.attempts.find(a=>a.id === c.attemptId && a.date === today))
    ]
    for (const a of needed) {
      if (!a || !committed.attempts.some(old=>canonical(old) === canonical(a) && !old.outcome)) fail('Commit the unused reservation checkpoint before applying tracking work')
    }
    const updated = applyBatch(document, outlooks, markdown, batch)
    await save(file,updated)
    return 'Prediction changes validated and saved'
  } else return JSON.stringify(select(document, outlooks, markdown, today), null, 2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await run(process.argv.slice(2)))
