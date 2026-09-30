import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, writeFile, readFile, cp} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {select, applyBatch, validate, migrate, run} from '../scripts/prediction-tracking.mjs'
import {renderTrack, enrich} from '../scripts/render-predictions.mjs'
const source = {label:'Evidence',url:'https://example.org/evidence'}
const outlook = {assessment:'A testable development is expected.',reviewed:'2026-09-30',validUntil:'2026-10-30',confidence:'medium'}
const outlooks = {outlooks:{'Russia.md':outlook}}
const doc = () => ({version:2,settings:{enabled:true,topics:['Russia.md'],maximumTrackedTopics:4,maximumActivePerTopic:1,maximumAssessmentsPerRun:2,maximumCreationsPerRun:1,minimumDaysBetweenPredictions:30},predictions:[],attempts:[]})
const prediction = () => ({id:'russia-2026-09-30',kind:'event',topicFile:'Russia.md',created:'2026-09-30',deadline:'2026-10-30',statement:'A measurable development will occur.',successCondition:'An official confirmation by deadline.',failureCondition:'No confirmation in the full window, established by verification.',confidence:'medium',sources:[source],outlookSnapshot:outlook})
const assessment = (result='supported',assessed='2026-10-31')=>({result,assessed,evidenceThrough:'2026-10-30',explanation:'Evidence establishes the outcome.',sources:[source]})
test('R01: persistence and partial verdicts require a closed, fully covered window',()=>{
 const p={...prediction(),kind:'persistence',partialCondition:'A predefined partial outcome.'}
 const verify=a=>validate({...doc(),predictions:[{...p,assessment:a}]})
 assert.throws(()=>verify({...assessment('supported','2026-10-01'),evidenceThrough:'2026-10-01'}),/deadline day/)
 assert.throws(()=>verify(assessment('supported','2026-10-30')),/deadline day/)
 assert.throws(()=>verify({...assessment(),evidenceThrough:'2026-10-29'}),/full prediction window/)
 assert.doesNotThrow(()=>verify(assessment()))
 assert.throws(()=>validate({...doc(),predictions:[{...prediction(),partialCondition:'Predefined',assessment:{...assessment('partly-supported','2026-10-01'),evidenceThrough:'2026-10-01'}}]}),/deadline day/)
 assert.throws(()=>verify({...assessment('not-supported'),evidenceThrough:'2026-10-01'}),/full prediction window/)
 assert.doesNotThrow(()=>verify({...assessment('unverifiable'),evidenceThrough:'2026-10-01'}))
})
test('R01: horizon, invalid kinds, event window and empty legacy migration',()=>{
 assert.throws(()=>validate({...doc(),predictions:[{...prediction(),deadline:'2050-01-01'}]}),/horizon/)
 assert.throws(()=>validate({...doc(),predictions:[{...prediction(),kind:'unknown'}]}),/kind/)
 assert.throws(()=>validate({...doc(),predictions:[{...prediction(),assessment:{...assessment(),evidenceThrough:'2026-09-29'}}]}),/Invalid assessment/)
 const old={...doc(),version:1};delete old.attempts
 const original=JSON.stringify(old),upgraded=migrate(old)
 assert.equal(JSON.stringify(old),original);assert.deepEqual(upgraded.settings,old.settings)
 assert.equal(upgraded.version,2);assert.deepEqual(upgraded.attempts,[])
 assert.deepEqual(migrate(upgraded),upgraded)
 assert.throws(()=>migrate({...old,predictions:[prediction()]}),/explicit reviewed migration/)
})
test('off switch exits without requiring any outlook or daily files and changes nothing',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tracking-off-'));await mkdir(path.join(root,'Data'))
 const d=doc();d.settings.enabled=false;const raw=JSON.stringify(d);await writeFile(path.join(root,'Data/prediction-tracking.json'),raw)
 const output=await run(['--root',root])
 assert.equal(JSON.parse(output).enabled,false);assert.equal(await readFile(path.join(root,'Data/prediction-tracking.json'),'utf8'),raw)
 assert.throws(()=>applyBatch(d,outlooks,'',{date:'2026-09-30'}),/paused/)
})
test('creation preserves original outlook and enforces snapshots, freshness, active cap and daily quota',()=>{
 const d=doc(),before=JSON.stringify(outlooks)
 const next=applyBatch(d,outlooks,'',{date:'2026-09-30',additions:[prediction()]})
 assert.equal(JSON.stringify(outlooks),before);assert.equal(d.predictions.length,0)
 assert.equal(select(next,outlooks,'','2026-09-30').creations.length,0)
 assert.equal(select(d,outlooks,'','2026-10-01').creations.length,0)
 assert.throws(()=>applyBatch(d,outlooks,'',{date:'2026-09-30',additions:[{...prediction(),outlookSnapshot:{...outlook,assessment:'Changed'}}]}),/Snapshot/)
 assert.throws(()=>applyBatch(d,outlooks,'',{date:'2026-09-30',additions:[prediction(),prediction()]}),/limit/)
})
test('deadline priority, capped assessments and deferrals',()=>{
 const d=doc();d.predictions=[prediction(),{...prediction(),id:'second',deadline:'2026-10-20'},{...prediction(),id:'third',deadline:'2026-10-25'}]
 const plan=select(d,outlooks,'','2026-10-31')
 assert.deepEqual(plan.assessments.map(p=>p.id),['second','third']);assert.deepEqual(plan.deferred,['russia-2026-09-30'])
})
test('early coverage is only a review candidate; negative outcomes wait until the day ends',()=>{
 const d=doc();d.predictions=[prediction()]
 assert.equal(select(d,outlooks,'','2026-10-01').assessments.length,0)
 assert.equal(select(d,outlooks,'Topics/Russia.md','2026-10-01').assessments.length,1)
 const early={...assessment('supported','2026-10-01'),evidenceThrough:'2026-10-01'}
 const next=applyBatch(d,outlooks,'Topics/Russia.md',{date:'2026-10-01',assessments:[{id:prediction().id,assessment:early}]})
 assert.equal(next.predictions[0].assessment.result,'supported')
 assert.throws(()=>validate({...d,predictions:[{...prediction(),assessment:assessment('not-supported','2026-10-30')}]}),/deadline day/)
})
test('final assessments cannot be overwritten; late events and invented partial success are rejected',()=>{
 const d=doc();d.predictions=[prediction()]
 const next=applyBatch(d,outlooks,'',{date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment()}]})
 assert.throws(()=>applyBatch(next,outlooks,'',{date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment('not-supported')}]}))
 assert.throws(()=>validate({...d,predictions:[{...prediction(),assessment:{...assessment(),evidenceThrough:'2026-10-31'}}]}),/window/)
 assert.throws(()=>validate({...d,predictions:[{...prediction(),assessment:assessment('partly-supported')}]}),/partial condition/)
 assert.throws(()=>validate({...d,predictions:[{...prediction(),deadline:'2026-02-30'}]}))
})
test('paused history, empty states and escaped content render honestly',()=>{
 const d=doc();assert.match(renderTrack(d,'Russia.md'),/No predictions recorded/)
 d.settings.enabled=false;d.predictions=[{...prediction(),statement:'<script>alert(1)</script>',assessment:assessment('not-supported')}]
 const html=renderTrack(d,'Russia.md');assert.match(html,/paused/);assert.match(html,/Not supported/);assert.match(html,/Last assessment: 2026-10-31/);assert.ok(!html.includes('<script>'))
})
test('integration: insertion below outlook, idempotence and original outlook HTML/data unchanged',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tracking-render-'));await mkdir(path.join(root,'Topics'))
 const file=path.join(root,'Topics/Russia.md'), data=path.join(root,'tracking.json')
 const original='<section class="topic-outlook"><h2>Outlook</h2><p>Original content</p></section>'
 await writeFile(file,'# Russia\n\n'+original+'\n\n<section class="topic-momentum">Momentum</section>')
 const d=doc();d.predictions=[{...prediction(),assessment:assessment()}];const raw=JSON.stringify(d);await writeFile(data,raw)
 await enrich(root,data);const first=await readFile(file,'utf8');await enrich(root,data)
 assert.equal(await readFile(file,'utf8'),first);assert.ok(first.includes(original));assert.ok(first.indexOf('Outlook track record')>first.indexOf(original));assert.ok(first.indexOf('Outlook track record')<first.indexOf('topic-momentum'))
 assert.equal(await readFile(data,'utf8'),raw);const overview=await readFile(path.join(root,'outlook-track-record.md'),'utf8');assert.match(overview,/id="prediction-topic"/);assert.match(overview,/id="prediction-result"/)
})

test('overview filters combine topic, result and date and reveal entries again',async()=>{
 const {runInNewContext}=await import('node:vm')
 const controls=Object.fromEntries(['prediction-topic','prediction-result','prediction-date'].map(id=>[id,{value:'',addEventListener(_event,fn){this.change=fn}}]))
 const count={textContent:''}
 const entries=[{dataset:{topic:'Russia.md',result:'supported',date:'2026-09-30'}},{dataset:{topic:'Iran.md',result:'not-supported',date:'2026-10-02'}}]
 const document={getElementById:id=>controls[id]??count,querySelectorAll:()=>entries}
 runInNewContext(await readFile('site/static/prediction-filters.js','utf8'),{document})
 controls['prediction-topic'].value='Russia.md';controls['prediction-topic'].change();assert.equal(entries[1].hidden,true);assert.equal(entries[0].hidden,false)
 controls['prediction-date'].value='2026-10-01';controls['prediction-date'].change();assert.ok(entries.every(e=>e.hidden));assert.match(count.textContent,/0 matching/)
 for(const control of Object.values(controls))control.value=''
 controls['prediction-result'].change();assert.ok(entries.every(e=>!e.hidden));assert.match(count.textContent,/2 matching/)
})
