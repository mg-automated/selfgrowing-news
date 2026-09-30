import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, writeFile, readFile, cp} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {select, applyBatch, validate, migrate, validateHistory, appendCorrections, effectiveAssessment, reserveAttempts, run} from '../scripts/prediction-tracking.mjs'
import {validateGitHistory} from '../scripts/validate-prediction-history.mjs'
import {renderTrack, enrich} from '../scripts/render-predictions.mjs'
const source = {label:'Evidence',url:'https://example.org/evidence'}
const outlook = {assessment:'A testable development is expected.',reviewed:'2026-09-30',validUntil:'2026-10-30',confidence:'medium'}
const outlooks = {outlooks:{'Russia.md':outlook}}
const doc = () => ({version:2,settings:{enabled:true,topics:['Russia.md'],maximumTrackedTopics:4,maximumActivePerTopic:1,maximumAssessmentsPerRun:2,maximumCreationsPerRun:1,minimumDaysBetweenPredictions:30},predictions:[],attempts:[]})
const prediction = () => ({id:'russia-2026-09-30',kind:'event',topicFile:'Russia.md',created:'2026-09-30',deadline:'2026-10-30',statement:'A measurable development will occur.',successCondition:'An official confirmation by deadline.',failureCondition:'No confirmation in the full window, established by verification.',confidence:'medium',sources:[source],outlookSnapshot:outlook})
const assessment = (result='supported',assessed='2026-10-31')=>({result,assessed,evidenceThrough:'2026-10-30',explanation:'Evidence establishes the outcome.',sources:[source]})
const budgetDoc = () => {const d=doc();Object.assign(d.settings,{maximumAssessmentAttemptsPerDay:2,maximumCreationAttemptsPerDay:2,maximumAdditionalLookupsPerAssessment:3});return d}
test('R04: pending and interrupted attempts consume daily allowance; remaining deferrals are complete',()=>{
 const d=budgetDoc();d.predictions=[prediction(),{...prediction(),id:'second',topicFile:'Iran.md'},{...prediction(),id:'third',topicFile:'Strait-of-Hormuz.md'}]
 const {document:reserved,work}=reserveAttempts(d,outlooks,'','2026-10-31')
 assert.equal(work.length,2);assert.equal(reserveAttempts(reserved,outlooks,'','2026-10-31').work.length,0)
 assert.equal(select(reserved,outlooks,'','2026-10-31').assessments.length,0)
 const pending=applyBatch(reserved,outlooks,'',{date:'2026-10-31',attemptOutcomes:[{attemptId:work[0].id,status:'pending',explanation:'The evidence remains inconclusive.',additionalLookups:2}]})
 assert.ok(pending.predictions.every(p=>!p.assessment))
 assert.equal(select(pending,outlooks,'','2026-10-31').assessments.length,0)
 assert.deepEqual(new Set(select(pending,outlooks,'','2026-10-31').deferred),new Set(d.predictions.map(p=>p.id)))
 const finished=applyBatch(pending,outlooks,'',{date:'2026-10-31',assessments:[{id:work[1].predictionId,assessment:assessment(),additionalLookups:1}]})
 assert.equal(finished.predictions.filter(p=>p.assessment).length,1)
 assert.equal(select(finished,outlooks,'','2026-10-31').assessments.length,0)
 assert.equal(select(finished,outlooks,'','2026-11-01').assessments.length,2)
 assert.throws(()=>applyBatch(pending,outlooks,'',{date:'2026-10-31',attemptOutcomes:[{attemptId:work[0].id,status:'pending',explanation:'Retry',additionalLookups:1}]}),/unused reserved/)
 const edited=structuredClone(finished);edited.attempts=[];assert.throws(()=>validateHistory(finished,edited),/attempt deleted/)
 const completed=structuredClone(finished);completed.attempts[0].outcome.additionalLookups=0;assert.throws(()=>validateHistory(finished,completed),/attempt changed/)
})
test('R04: lookup counts, early research prohibition, reduced budgets and persistence selection',()=>{
 const d=budgetDoc();d.predictions=[prediction()]
 const early=reserveAttempts(d,outlooks,'Topics/Russia.md','2026-10-01')
 assert.equal(early.work[0].lookupLimit,0)
 assert.throws(()=>applyBatch(early.document,outlooks,'',{date:'2026-10-01',attemptOutcomes:[{attemptId:early.work[0].id,status:'pending',explanation:'Pending',additionalLookups:1}]}),/lookup count/)
 const {document:reserved,work}=reserveAttempts(d,outlooks,'','2026-10-31')
 assert.throws(()=>applyBatch(reserved,outlooks,'',{date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment(),additionalLookups:4}]}),/lookup count/)
 assert.throws(()=>applyBatch(reserved,outlooks,'',{date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment()}]}),/lookup count/)
 const off=structuredClone(reserved);off.settings.enabled=false
 assert.equal(select(off,outlooks,'','2026-10-31').assessments.length,0)
 assert.throws(()=>reserveAttempts(off,outlooks,'','2026-10-31'),/paused/)
 assert.throws(()=>applyBatch(off,outlooks,'',{date:'2026-10-31',attemptOutcomes:[]}),/paused/)
 const reduced=structuredClone(d);reduced.settings.maximumAssessmentAttemptsPerDay=0
 assert.equal(select(reduced,outlooks,'','2026-10-31').assessments.length,0)
 const lower=structuredClone(reserved);lower.settings.maximumAssessmentAttemptsPerDay=0
 assert.doesNotThrow(()=>validate(lower)) // historical reservations retain their recorded budget
 const persistence={...d,predictions:[{...prediction(),kind:'persistence'}]}
 assert.equal(select(persistence,outlooks,'Topics/Russia.md','2026-10-30').assessments.length,0)
 assert.equal(select(persistence,outlooks,'','2026-10-31').assessments.length,1)
 assert.throws(()=>validate({...d,attempts:[...work,{...work[0],id:'duplicate-subject'}]}),/Duplicate daily attempt/)
 const missing=structuredClone(reserved);delete missing.settings.maximumAssessmentAttemptsPerDay
 assert.throws(()=>validateHistory(reserved,missing),/settings cannot be removed/)
})
test('R04: a partially used final-assessment budget reports every unselected due record',()=>{
 const d=doc();d.predictions=[{...prediction(),assessment:assessment()},{...prediction(),id:'second'},{...prediction(),id:'third'}]
 const plan=select(d,outlooks,'','2026-10-31')
 assert.deepEqual(plan.assessments.map(p=>p.id),['second']);assert.deepEqual(plan.deferred,['third'])
})
test('R04: two candidates allow fallback without extra research; skipped topics rotate fairly',()=>{
 const d=budgetDoc();d.settings.topics=['Artificial-Intelligence.md','Russia.md','Iran.md','Strait-of-Hormuz.md']
 const current={outlooks:Object.fromEntries(d.settings.topics.map(t=>[t,outlook]))}
 const {document:reserved,work}=reserveAttempts(d,current,'','2026-09-30')
 assert.deepEqual(work.map(a=>a.topicFile),['Artificial-Intelligence.md','Russia.md'])
 const next=applyBatch(reserved,current,'',{date:'2026-09-30',additions:[prediction()],attemptOutcomes:[{attemptId:work[0].id,status:'skipped',explanation:'No measurable claim',additionalLookups:0}]})
 assert.equal(next.predictions.length,1)
 assert.equal(select(next,current,'','2026-09-30').creations.length,0)
 const tomorrow={outlooks:Object.fromEntries(d.settings.topics.map(t=>[t,{...outlook,reviewed:'2026-10-01'}]))}
 assert.deepEqual(select(next,tomorrow,'','2026-10-01').creations.map(c=>c.topicFile),['Iran.md','Strait-of-Hormuz.md'])
 assert.equal(JSON.stringify(current),JSON.stringify({outlooks:Object.fromEntries(d.settings.topics.map(t=>[t,outlook]))}))
 const unreserved=structuredClone(next);unreserved.attempts=[]
 assert.throws(()=>validateHistory(d,unreserved),/prior committed creation attempt/)
 assert.throws(()=>applyBatch(reserved,current,'',{date:'2026-09-30',additions:[prediction(),{...prediction(),id:'extra',topicFile:'Artificial-Intelligence.md'}]}),/limit/)
})
test('R04 CLI: reservation checkpoint is required, writes are atomic and retries are capped',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tracking-reserve-'));await mkdir(path.join(root,'Data'))
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.org')
 const file=path.join(root,'Data/prediction-tracking.json'),batchFile=path.join(root,'batch.json')
 const d=budgetDoc();d.predictions=[prediction()]
 await writeFile(file,JSON.stringify(d));await writeFile(path.join(root,'Data/topic-outlooks.json'),JSON.stringify(outlooks));git('add','Data');git('commit','-qm','baseline')
 const args=['--root',root,'--date','2026-10-31'],clock=new Date('2026-10-31T12:00:00Z')
 await assert.rejects(()=>run([...args,'--reserve'],new Date('2026-11-01T12:00:00Z')),/actual Zurich/)
 const reservation=JSON.parse(await run([...args,'--reserve'],clock));assert.equal(reservation.work.length,1)
 await writeFile(batchFile,JSON.stringify({date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment(),additionalLookups:3}]}))
 const before=await readFile(file,'utf8')
 await assert.rejects(()=>run([...args,'--apply',batchFile],clock),/Commit the unused reservation/)
 assert.equal(await readFile(file,'utf8'),before)
 git('add','Data/prediction-tracking.json');git('commit','-qm','tracking checkpoint')
 await run([...args,'--apply',batchFile],clock)
 assert.equal(JSON.parse(await readFile(file,'utf8')).predictions[0].assessment.result,'supported')
 await assert.rejects(()=>run([...args,'--apply',batchFile],clock),/reservation|invalid assessment/)
 const raw=await readFile(file,'utf8');const repeat=JSON.parse(await run([...args,'--reserve'],clock))
 assert.equal(repeat.work.length,0);assert.equal(await readFile(file,'utf8'),raw)
 assert.match(validateGitHistory(root),/valid/)
 await writeFile(path.join(root,'Data/.prediction-tracking.lock'),'active')
 await assert.rejects(()=>run([...args,'--reserve'],clock),/writer is active/)
 assert.equal(await readFile(file,'utf8'),raw)
})
test('end-to-end CLI: creation, committed assessment, paused maintenance correction and preserved Outlooks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tracking-lifecycle-'));await mkdir(path.join(root,'Data'))
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.org')
 const file=path.join(root,'Data/prediction-tracking.json'),batchFile=path.join(root,'batch.json'),outlookFile=path.join(root,'Data/topic-outlooks.json')
 await writeFile(file,JSON.stringify(budgetDoc()));await writeFile(outlookFile,JSON.stringify(outlooks))
 const commit=message=>{git('add','Data');git('commit','-qm',message)};commit('baseline')
 const call=(day,...args)=>run(['--root',root,'--date',day,...args],new Date(day+'T12:00:00Z'))
 await call('2026-09-30','--reserve');commit('creation checkpoint')
 await writeFile(batchFile,JSON.stringify({date:'2026-09-30',additions:[prediction()]}))
 await call('2026-09-30','--apply',batchFile);commit('creation result')
 await call('2026-10-31','--reserve');commit('assessment checkpoint')
 await writeFile(batchFile,JSON.stringify({date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment(),additionalLookups:0}]}))
 await call('2026-10-31','--apply',batchFile);commit('assessment result')
 const completed=JSON.parse(await readFile(file,'utf8'));completed.settings.enabled=false
 await writeFile(file,JSON.stringify(completed));commit('pause')
 const correction={id:'review-1',corrected:'2026-11-01',reason:'Reviewed factual correction',sources:[source],assessment:assessment('not-supported','2026-11-01')}
 await writeFile(batchFile,JSON.stringify({date:'2026-11-01',corrections:[{predictionId:prediction().id,correction}]}))
 await assert.rejects(()=>call('2026-11-01','--correct',batchFile),/--reviewed/)
 await call('2026-11-01','--correct',batchFile,'--reviewed');commit('reviewed correction')
 assert.match(validateGitHistory(root),/valid/)
 const final=JSON.parse(await readFile(file,'utf8'))
 assert.equal(final.predictions[0].assessment.result,'supported');assert.equal(effectiveAssessment(final.predictions[0]).result,'not-supported')
 assert.match(renderTrack(final,'Russia.md'),/Original assessment/)
 assert.equal(await readFile(outlookFile,'utf8'),JSON.stringify(outlooks))
})
test('R02: history rejects deletion, condition/snapshot rewrites and overwritten final judgments',()=>{
 const previous={...doc(),predictions:[{...prediction(),assessment:assessment()}]}
 assert.throws(()=>validateHistory(previous,doc()),/deleted/)
 for(const mutate of [p=>p.statement='Different',p=>p.successCondition='Easier',p=>p.outlookSnapshot.assessment='Changed',p=>p.assessment.result='not-supported']) {
  const next=structuredClone(previous);mutate(next.predictions[0]);assert.throws(()=>validateHistory(previous,next),/changed/)
 }
 assert.doesNotThrow(()=>validateHistory(previous,JSON.parse(JSON.stringify(previous))))
 const pending={...doc(),predictions:[prediction()]};assert.doesNotThrow(()=>validateHistory(pending,previous))
})
test('R02: reviewed corrections append and display both original and corrected outcomes',()=>{
 const d={...doc(),predictions:[{...prediction(),assessment:assessment()}]}
 const before=JSON.stringify(d),correction={id:'fix-1',corrected:'2026-11-01',reason:'Source correction <script>',sources:[source],assessment:assessment('not-supported','2026-11-01')}
 const next=appendCorrections(d,{date:'2026-11-01',corrections:[{predictionId:prediction().id,correction}]})
 assert.equal(JSON.stringify(d),before);assert.deepEqual(next.predictions[0].assessment,d.predictions[0].assessment)
 assert.equal(effectiveAssessment(next.predictions[0]).result,'not-supported')
 const html=renderTrack(next,'Russia.md');assert.match(html,/Original assessment/);assert.match(html,/Supported/);assert.match(html,/Not supported/);assert.match(html,/data-result="not-supported"/);assert.ok(!html.includes('<script>'))
 const removed=structuredClone(next);removed.predictions[0].corrections=[];assert.throws(()=>validateHistory(next,removed),/correction changed/)
 assert.throws(()=>appendCorrections(next,{date:'2026-11-01',corrections:[{predictionId:prediction().id,correction}]}),/unique ID/)
 assert.throws(()=>appendCorrections({...doc(),predictions:[prediction()]},{date:'2026-11-01',corrections:[{predictionId:prediction().id,correction}]}),/target/)
 assert.throws(()=>applyBatch(d,outlooks,'',{date:'2026-11-01',corrections:[]}),/separate reviewed/)
})
test('R02: Git validation catches working edits and an intermediate rewrite restored later',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tracking-history-'));await mkdir(path.join(root,'Data'))
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
 git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.org')
 const file=path.join(root,'Data/prediction-tracking.json'),d={...doc(),predictions:[{...prediction(),assessment:assessment()}]}
 const commit=async(data,message)=>{await writeFile(file,JSON.stringify(data));git('add','.');git('commit','-qm',message)}
 await commit(d,'original');const base=git('rev-parse','HEAD').trim()
 assert.match(validateGitHistory(root),/valid/)
 const bad=structuredClone(d);bad.predictions[0].statement='A revised easier prediction'
 await writeFile(file,JSON.stringify(bad));assert.throws(()=>validateGitHistory(root),/Original prediction changed/)
 await commit(bad,'rewrite');await commit(d,'restore')
 assert.throws(()=>validateGitHistory(root,base),/Original prediction changed/)
 assert.throws(()=>validateGitHistory(root),/Original prediction changed/)
})
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
 const reserved=reserveAttempts(d,outlooks,'','2026-09-30').document
 const next=applyBatch(reserved,outlooks,'',{date:'2026-09-30',additions:[prediction()]})
 assert.equal(JSON.stringify(outlooks),before);assert.equal(d.predictions.length,0)
 assert.equal(select(next,outlooks,'','2026-09-30').creations.length,0)
 assert.equal(select(d,outlooks,'','2026-10-01').creations.length,0)
 assert.throws(()=>applyBatch(reserved,outlooks,'',{date:'2026-09-30',additions:[{...prediction(),outlookSnapshot:{...outlook,assessment:'Changed'}}]}),/Snapshot/)
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
 const reserved=reserveAttempts(d,outlooks,'Topics/Russia.md','2026-10-01').document
 const next=applyBatch(reserved,outlooks,'Topics/Russia.md',{date:'2026-10-01',assessments:[{id:prediction().id,assessment:early,additionalLookups:0}]})
 assert.equal(next.predictions[0].assessment.result,'supported')
 assert.throws(()=>validate({...d,predictions:[{...prediction(),assessment:assessment('not-supported','2026-10-30')}]}),/deadline day/)
})
test('final assessments cannot be overwritten; late events and invented partial success are rejected',()=>{
 const d=doc();d.predictions=[prediction()]
 const reserved=reserveAttempts(d,outlooks,'','2026-10-31').document
 const next=applyBatch(reserved,outlooks,'',{date:'2026-10-31',assessments:[{id:prediction().id,assessment:assessment(),additionalLookups:0}]})
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
