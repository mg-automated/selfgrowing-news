import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {select, reserveAttempts, applyBatch, migrateRotation, validate, validateHistory, run} from '../scripts/prediction-tracking.mjs'
import {validateGitHistory} from '../scripts/validate-prediction-history.mjs'
import {renderTrack, enrich} from '../scripts/render-predictions.mjs'

const today = '2026-10-30'
const sources = [{label:'Verified evidence',url:'https://example.org/evidence'}]
const budget = {assessmentAttempts:2,creationAttempts:2,assessments:2,creations:1,additionalLookups:3}
const snapshot = (reviewed=today) => ({reviewed,validUntil:'2026-12-01',assessment:'A measurable change is expected.',confidence:'medium'})
const legacy = () => ({version:2,settings:{enabled:true,topics:['Russia.md'],maximumTrackedTopics:4,maximumActivePerTopic:1,maximumAssessmentsPerRun:2,maximumCreationsPerRun:1,maximumAssessmentAttemptsPerDay:2,maximumCreationAttemptsPerDay:2,maximumAdditionalLookupsPerAssessment:3,minimumDaysBetweenPredictions:30},predictions:[],attempts:[]})
const rotating = () => migrateRotation(legacy())
const prediction = (topic,created='2026-09-01',deadline='2026-10-20') => ({id:`${topic}-${created}`,topicFile:topic,kind:'event',created,deadline,statement:'A measurable change will occur.',successCondition:'An official confirmation within the window.',failureCondition:'Verified absence throughout the window.',partialCondition:'A predefined incomplete change.',confidence:'medium',sources,outlookSnapshot:snapshot(created)})
const assessment = (result='supported') => ({assessed:'2026-10-21',evidenceThrough:'2026-10-20',result,explanation:'Evidence establishes the outcome.',sources})
const current = (...topics) => ({outlooks:Object.fromEntries(topics.map(t=>[t,snapshot()]))})

test('rotation migration preserves every record and spent attempt, is idempotent and retains legacy validation',()=>{
 const d=legacy();d.predictions=[{...prediction('Russia.md'),assessment:assessment(),corrections:[{id:'note',corrected:'2026-10-22',reason:'Evidence clarification.',sources}]}]
 d.attempts=['First.md','Second.md'].map(topicFile=>({id:`${today}:creation:${topicFile}`,date:today,kind:'creation',topicFile,lookupLimit:0,budget,outcome:{status:'skipped',explanation:'No measurable prediction.',additionalLookups:0}}))
 const before=JSON.stringify(d), next=migrateRotation(d)
 assert.equal(JSON.stringify(d),before)
 assert.deepEqual(next.predictions,d.predictions);assert.deepEqual(next.attempts,d.attempts)
 assert.equal(next.settings.maximumActivePredictions,4)
 assert.equal(next.settings.topics,undefined);assert.equal(next.settings.maximumTrackedTopics,undefined)
 for(const key of Object.keys(d.settings).filter(k=>!['topics','maximumTrackedTopics'].includes(k))) assert.deepEqual(next.settings[key],d.settings[key])
 assert.deepEqual(migrateRotation(next),next);assert.equal(validate(d),d);validateHistory(d,next)
 assert.equal(select(next,current('European-Security.md'),'',today).creations.length,0)
 assert.throws(()=>validateHistory(next,d),/cap cannot be removed/)
})

test('newly tracked Outlooks outrank repeat topics; only fresh valid Outlooks qualify, with stable ordering',()=>{
 const d=rotating();d.predictions=[{...prediction('Russia.md'),assessment:assessment()}]
 const outlooks=current('Russia.md','European-Security.md','Alpha.md','Beta.md','Stale.md','Expired.md','bad/name.md')
 outlooks.outlooks['Stale.md'].reviewed='2026-10-29';outlooks.outlooks['Expired.md'].validUntil=today
 const original=JSON.stringify(outlooks)
 const plan=select(d,outlooks,'',today)
 assert.deepEqual(plan.creations.map(c=>c.topicFile),['Alpha.md','Beta.md'])
 assert.deepEqual(plan.deferredCreations,['European-Security.md','Russia.md'])
 const reversed={outlooks:Object.fromEntries(Object.entries(outlooks.outlooks).reverse())}
 assert.deepEqual(select(d,reversed,'',today),plan)
 assert.equal(JSON.stringify(outlooks),original)
 assert.equal(select(d,current('European-Security.md'),'',today).creations[0].topicFile,'European-Security.md')
})

test('unsuitable never-tracked topics rotate by oldest evaluation without losing daily or rerun limits',()=>{
 const d=rotating()
 d.attempts=[{id:'older',date:'2026-10-29',kind:'creation',topicFile:'Alpha.md',lookupLimit:0,budget,outcome:{status:'skipped',explanation:'Unsuitable.',additionalLookups:0}}]
 const outlooks=current('Alpha.md','Beta.md','European-Security.md')
 const reserved=reserveAttempts(d,outlooks,'',today)
 assert.deepEqual(reserved.work.map(w=>w.topicFile),['Beta.md','European-Security.md'])
 assert.equal(select(reserved.document,outlooks,'',today).creations.length,0)
 assert.equal(reserveAttempts(reserved.document,outlooks,'',today).work.length,0)
 const tomorrow={outlooks:Object.fromEntries(Object.entries(outlooks.outlooks).map(([k,v])=>[k,{...v,reviewed:'2026-10-31'}]))}
 assert.equal(select(reserved.document,tomorrow,'','2026-10-31').creations[0].topicFile,'Alpha.md')
})

test('four pending or overdue predictions block new creation while assessments retain their own budget',()=>{
 const d=rotating();d.predictions=['A.md','B.md','C.md','D.md'].map(t=>prediction(t))
 const plan=select(d,current('European-Security.md'),'',today)
 assert.equal(plan.activePredictions,4);assert.equal(plan.availablePredictionSlots,0)
 assert.equal(plan.creations.length,0);assert.equal(plan.assessments.length,2)
 assert.equal(plan.deferred.length,2);assert.equal(plan.deferredCreations[0],'European-Security.md')
 assert.equal(reserveAttempts(d,current('European-Security.md'),'',today).work.filter(w=>w.kind==='creation').length,0)
 assert.throws(()=>validate({...d,predictions:[...d.predictions,prediction('Fifth.md')]}),/Global active/)
 assert.throws(()=>validate({...d,predictions:[prediction('Same.md'),{...prediction('Same.md'),id:'second'}]}),/cap per topic/)
})

test('every final result frees a slot and repeat topics still wait thirty days',()=>{
 for(const result of ['supported','partly-supported','not-supported','unverifiable']) {
  const d=rotating();d.predictions=['A.md','B.md','C.md','D.md'].map(t=>prediction(t))
  d.predictions[0].assessment=assessment(result)
  const plan=select(d,current('European-Security.md'),'',today)
  assert.equal(plan.availablePredictionSlots,1);assert.equal(plan.creations[0].topicFile,'European-Security.md')
 }
 const d=rotating();d.predictions=[{...prediction('Russia.md','2026-10-15'),assessment:assessment()}]
 assert.equal(select(d,current('Russia.md'),'',today).creations.length,0)
 assert.equal(select(d,{outlooks:{'Russia.md':snapshot('2026-11-13')}},'','2026-11-13').creations.length,0)
 assert.equal(select(d,{outlooks:{'Russia.md':snapshot('2026-11-14')}},'','2026-11-14').creations.length,1)
})

test('two fallback candidates share the last slot; writer rejects overfill and a second daily creation',()=>{
 const d=rotating();d.predictions=['A.md','B.md','C.md'].map(t=>prediction(t,'2026-10-01','2026-11-10'))
 const outlooks=current('D.md','European-Security.md')
 const {document:reserved,work}=reserveAttempts(d,outlooks,'',today)
 assert.equal(work.length,2)
 const skipped=applyBatch(reserved,outlooks,'',{date:today,attemptOutcomes:[{attemptId:work[0].id,status:'skipped',explanation:'No defensible expectation.',additionalLookups:0}]})
 const addition={...prediction('European-Security.md',today,'2026-11-10'),outlookSnapshot:outlooks.outlooks['European-Security.md']}
 const complete=applyBatch(skipped,outlooks,'',{date:today,additions:[addition]})
 assert.equal(complete.predictions.filter(p=>!p.assessment).length,4)
 assert.deepEqual(complete.predictions.slice(0,3),d.predictions)
 assert.equal(select(complete,outlooks,'',today).creations.length,0)
 const concurrentlyFilled=structuredClone(reserved)
 concurrentlyFilled.predictions.push(prediction('Other.md','2026-10-02','2026-11-10'))
 assert.throws(()=>applyBatch(concurrentlyFilled,outlooks,'',{date:today,additions:[addition]}),/Global active/)
 const spare=structuredClone(complete);spare.predictions=spare.predictions.filter(p=>p.topicFile!=='A.md')
 const second={...prediction('D.md',today,'2026-11-10'),outlookSnapshot:outlooks.outlooks['D.md']}
 assert.throws(()=>applyBatch(spare,outlooks,'',{date:today,additions:[second]}))
})

test('rotation CLI preserves history through migration, checkpoint and new-topic creation; rendering retains archives',async t=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'prediction-rotation-')))
 t.after(()=>rm(root,{recursive:true,force:true}))
 for(const dir of ['Data','Topics','News/Daily']) await mkdir(path.join(root,dir),{recursive:true})
 const old=legacy();old.predictions=[{...prediction('Russia.md'),assessment:assessment()}]
 const data=path.join(root,'Data/prediction-tracking.json'), outlookFile=path.join(root,'Data/topic-outlooks.json')
 const outlookText=JSON.stringify(current('European-Security.md','Unused.md'))
 await writeFile(data,JSON.stringify(old));await writeFile(outlookFile,outlookText)
 for(const name of ['Russia.md','European-Security.md','Unused.md']) await writeFile(path.join(root,'Topics',name),'# Topic\n<section class="topic-outlook">Outlook</section>\n')
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim()
 const commit=message=>{git('add','.');git('-c','user.name=Test','-c','user.email=test@example.org','commit','-qm',message)}
 git('init','-q');commit('legacy fixture')
 const now=new Date('2026-10-30T12:00:00+01:00')
 await assert.rejects(run(['--root',root,'--migrate-rotation'],now),/requires --reviewed/)
 assert.deepEqual(JSON.parse(await readFile(data,'utf8')),old)
 await run(['--root',root,'--migrate-rotation','--reviewed'],now);commit('enable rotation')
 const selection=JSON.parse(await run(['--root',root,'--date',today,'--reserve'],now))
 assert.equal(selection.work[0].topicFile,'European-Security.md');commit('reservation checkpoint')
 const addition={...prediction('European-Security.md',today,'2026-11-10'),outlookSnapshot:JSON.parse(outlookText).outlooks['European-Security.md']}
 const batch=path.join(root,'batch.json');await writeFile(batch,JSON.stringify({date:today,additions:[addition]}))
 await run(['--root',root,'--date',today,'--apply',batch],now)
 await rm(batch);commit('record prediction')
 assert.match(validateGitHistory(root),/Prediction history valid/)
 const final=JSON.parse(await readFile(data,'utf8'))
 assert.deepEqual(final.predictions[0],old.predictions[0]);assert.equal(final.predictions.length,2)
 assert.equal(await readFile(outlookFile,'utf8'),outlookText)
 assert.match(renderTrack(final,'Russia.md'),/Supported/);assert.match(renderTrack(final,'European-Security.md'),/Outcome not yet assessed/)
 assert.equal(renderTrack(final,'Unused.md'),'')
 await enrich(root,data)
 const overview=await readFile(path.join(root,'outlook-track-record.md'),'utf8')
 assert.match(overview,/<option value="European-Security.md">/);assert.match(overview,/<option value="Russia.md">/)
 assert.ok(!overview.includes('<option value="Unused.md">'))
 const block=await readFile(path.join(root,'Topics/European-Security.md'),'utf8')
 await enrich(root,data);assert.equal(await readFile(path.join(root,'Topics/European-Security.md'),'utf8'),block)
})
