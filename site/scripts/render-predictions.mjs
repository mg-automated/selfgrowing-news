import {readFile, writeFile, readdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {validate, labels, effectiveAssessment} from './prediction-tracking.mjs'
export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
const links = items => items.map(s=>`<a class="external" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>`).join(' · ')
export function renderEntry(p, overview = false) {
 const a = effectiveAssessment(p), result = a?.result ?? 'pending'
 return `<article class="prediction-entry" data-topic="${escape(p.topicFile)}" data-result="${result}" data-date="${p.created}">
 <div class="prediction-heading"><h3>${escape(p.statement)}</h3><span class="prediction-result result-${result}">${labels[result]}</span></div>
 ${overview ? `<p><a class="internal" href="Topics/${escape(p.topicFile)}">${escape(p.topicFile.replace('.md','').replaceAll('-',' '))}</a></p>` : ''}
 <p class="prediction-meta">Made ${p.created} · Deadline ${p.deadline} · ${escape(p.confidence)} confidence · ${p.kind === 'persistence' ? 'Throughout the window' : 'Event within the window'}</p>
 ${a ? `<p>${escape(a.explanation)}</p><p class="prediction-meta">Assessed ${a.assessed} · Evidence through ${a.evidenceThrough}</p><p><strong>Sources:</strong> ${links(a.sources)}</p>` : '<p>Outcome not yet assessed.</p>'}
 <details><summary>Original prediction and evidence</summary>
 <p><strong>Success condition:</strong> ${escape(p.successCondition)}</p>
 ${p.partialCondition ? `<p><strong>Partial condition:</strong> ${escape(p.partialCondition)}</p>` : ''}
 <p><strong>Failure condition:</strong> ${escape(p.failureCondition)}</p>
 <p><strong>Outlook when recorded (${p.outlookSnapshot.reviewed}):</strong> ${escape(p.outlookSnapshot.assessment)}</p>
 <p><strong>Sources:</strong> ${links(p.sources)}</p></details>
 ${(p.corrections ?? []).length ? `<details open><summary>Corrections (${p.corrections.length}) — original assessment preserved</summary>
 <p><strong>Original assessment:</strong> ${labels[p.assessment.result]} · ${p.assessment.assessed}</p><p>${escape(p.assessment.explanation)}</p><p>${links(p.assessment.sources)}</p>
 ${p.corrections.map(c=>`<section class="prediction-correction"><p><strong>Correction ${escape(c.id)} · ${c.corrected}:</strong> ${escape(c.reason)}</p><p>${links(c.sources)}</p>${c.assessment ? `<p><strong>Revised assessment:</strong> ${labels[c.assessment.result]} · Evidence through ${c.assessment.evidenceThrough}</p><p>${escape(c.assessment.explanation)}</p><p>${links(c.assessment.sources)}</p>` : ''}</section>`).join('')}
 </details>` : ''}</article>`
}
export function renderTrack(document, topic) {
 const predictions = document.predictions.filter(p=>p.topicFile === topic).sort((a,b)=>(effectiveAssessment(b)?.assessed ?? b.created).localeCompare(effectiveAssessment(a)?.assessed ?? a.created))
 if (!document.settings.topics.includes(topic) && !predictions.length) return ''
 const last = predictions.map(p=>effectiveAssessment(p)?.assessed).filter(Boolean).sort().at(-1)
 return `<section class="prediction-track" aria-labelledby="prediction-track-title"><h2 id="prediction-track-title">Outlook track record</h2>
 <p>${document.settings.enabled ? 'Testable expectations recorded separately from the outlook.' : '<strong>Prediction tracking paused.</strong> Existing records are preserved.'}</p>
 <p class="prediction-meta">${last ? 'Last assessment: ' + last : 'No assessments yet.'}</p>
 ${predictions.length ? renderEntry(predictions[0]) : '<p>No predictions recorded yet. Tracking starts with future daily runs; earlier outlooks are not scored retrospectively.</p>'}
 ${predictions.length > 1 ? `<details><summary>Show ${predictions.length - 1} earlier predictions</summary>${predictions.slice(1).map(p=>renderEntry(p)).join('\n')}</details>` : ''}
 <p><a class="internal" href="../outlook-track-record.md">Explore all predictions →</a></p></section>`
}
export async function enrich(contentRoot, dataPath) {
 const doc = validate(JSON.parse(await readFile(dataPath,'utf8')))
 const start = '<!-- prediction-track:start -->', end = '<!-- prediction-track:end -->'
 for (const name of (await readdir(path.join(contentRoot,'Topics'))).filter(n=>n.endsWith('.md'))) {
   const file = path.join(contentRoot,'Topics',name)
   let markdown = (await readFile(file,'utf8')).replace(/<!-- prediction-track:start -->[\s\S]*?<!-- prediction-track:end -->\s*/g,'')
   const track = renderTrack(doc,name)
   if (track) {
     const block = `${start}\n${track}\n${end}\n\n`
     if (/<section class="topic-outlook/.test(markdown)) markdown = markdown.replace(/(<section class="topic-outlook[\s\S]*?<\/section>\s*)/, '$1' + block)
     else if(markdown.includes('<!-- generated-topic-stories:start -->')) markdown = markdown.replace('<!-- generated-topic-stories:start -->', '<!-- generated-topic-stories:start -->\n\n' + block)
     else markdown += '\n\n' + block
   }
   await writeFile(file,markdown)
 }
 const predictions = [...doc.predictions].sort((a,b)=>b.created.localeCompare(a.created))
 const topicOptions = [...new Set([...doc.settings.topics,...predictions.map(p=>p.topicFile)])].sort()
 const dates = predictions.map(p=>p.created).sort()
 const overview = `---\ntitle: Outlook track record\n---\n\n# Outlook track record\n\n${doc.settings.enabled ? '' : '**Prediction tracking is paused.** Existing records remain available.\n\n'}**What did we expect—and what actually happened?**\n\nThis page tracks testable predictions from the archive’s AI-generated topic outlooks and checks them against later evidence. Each record shows the original prediction, its deadline and whether it was supported, partly supported or not supported. Predictions awaiting assessment are marked Pending; insufficient evidence is marked Unverifiable.\n\nFilter by topic, result or prediction date to explore the track record. Original predictions and assessments remain visible, including any corrections. Assessments are AI-assisted—follow the linked sources to judge the evidence.\n\n<details>\n<summary>How assessments work</summary>\n<ul>\n<li><strong>Recorded in advance:</strong> Predictions and their success conditions are saved before the outcome is known. Scheduled events alone do not count as predictions.</li>\n<li><strong>Checked against evidence:</strong> Assessments use linked sources and only count developments within the original prediction window. Missing news coverage does not prove failure.</li>\n<li><strong>Timing matters:</strong> An event prediction can be supported early if the evidence is conclusive. Other verdicts wait until the full deadline day has ended, using Europe/Zurich time.</li>\n<li><strong>Clear outcomes:</strong> Results are Supported, Partly supported, Not supported or Unverifiable. Predictions awaiting assessment remain Pending. Partial support requires a condition defined in advance.</li>\n<li><strong>History stays visible:</strong> Original predictions and assessments are preserved. Reviewed corrections are added alongside them; filters reflect the latest corrected verdict.</li>\n<li><strong>Limited daily workload:</strong> The pilot allows one new prediction and two assessment attempts per day. Pending or interrupted attempts still count toward that limit.</li>\n</ul>\n<p>This evaluates the archive’s forecasting process. Assessments are AI-assisted and may contain errors.</p>\n</details>\n\n${predictions.length ? `<div class="prediction-filters"><label>Topic <select id="prediction-topic"><option value="">All topics</option>${topicOptions.map(t=>`<option value="${escape(t)}">${escape(t.replace('.md','').replaceAll('-',' '))}</option>`).join('')}</select></label><label>Result <select id="prediction-result"><option value="">All results</option>${Object.entries(labels).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select></label><label>Predicted since <input type="date" id="prediction-date" min="${dates[0]}" max="${dates.at(-1)}"></label></div>\n<p id="prediction-count" aria-live="polite">${predictions.length} predictions</p>\n${predictions.map(p=>renderEntry(p,true)).join('\n')}` : 'No predictions recorded yet. The daily run will start recording prospective predictions when a freshly verified outlook supports a useful, measurable expectation.'}\n`
 await writeFile(path.join(contentRoot,'outlook-track-record.md'),overview)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await enrich(path.resolve(process.argv[2]),path.resolve(process.argv[3]))
