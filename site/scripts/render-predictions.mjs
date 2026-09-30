import {readFile, writeFile, readdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {validate, labels} from './prediction-tracking.mjs'
export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
const links = items => items.map(s=>`<a class="external" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)}</a>`).join(' · ')
export function renderEntry(p, overview = false) {
 const a = p.assessment, result = a?.result ?? 'pending'
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
 <p><strong>Sources:</strong> ${links(p.sources)}</p></details></article>`
}
export function renderTrack(document, topic) {
 const predictions = document.predictions.filter(p=>p.topicFile === topic).sort((a,b)=>(b.assessment?.assessed ?? b.created).localeCompare(a.assessment?.assessed ?? a.created))
 if (!document.settings.topics.includes(topic) && !predictions.length) return ''
 const last = predictions.map(p=>p.assessment?.assessed).filter(Boolean).sort().at(-1)
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
 const overview = `---\ntitle: Outlook track record\n---\n\n# Outlook track record\n\n${doc.settings.enabled ? 'Prediction tracking is active.' : '**Prediction tracking is paused.** Existing records remain available.'}\n\nThese are testable expectations derived from topic outlooks. Original predictions and conditions are preserved before outcomes are known. Assessment is AI-assisted; inspect the linked evidence. This measures this archive’s forecasting process, not AI accuracy in general.\n\nDeadlines include the entire Europe/Zurich calendar day and remain within the original Outlook horizon. An event can be supported early when conclusive evidence establishes it occurred within the window. Predictions requiring a condition to hold throughout the window, partial outcomes, and unmet expectations wait until the deadline day ends. A conclusive whole-window verdict requires evidence through the deadline; insufficient evidence is Unverifiable. Scheduled events do not count as successful predictions; missing coverage does not prove failure. Unverifiable results remain separate from supported and unsupported results.\n\n${predictions.length ? `<div class="prediction-filters"><label>Topic <select id="prediction-topic"><option value="">All topics</option>${topicOptions.map(t=>`<option value="${escape(t)}">${escape(t.replace('.md','').replaceAll('-',' '))}</option>`).join('')}</select></label><label>Result <select id="prediction-result"><option value="">All results</option>${Object.entries(labels).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select></label><label>Predicted since <input type="date" id="prediction-date" min="${dates[0]}" max="${dates.at(-1)}"></label></div>\n<p id="prediction-count" aria-live="polite">${predictions.length} predictions</p>\n${predictions.map(p=>renderEntry(p,true)).join('\n')}` : 'No predictions recorded yet. The daily run will start recording prospective predictions when a freshly verified outlook supports a useful, measurable expectation.'}\n`
 await writeFile(path.join(contentRoot,'outlook-track-record.md'),overview)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await enrich(path.resolve(process.argv[2]),path.resolve(process.argv[3]))
