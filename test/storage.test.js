'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Storage,validDay}=require('../src/storage');
const row=(id='1',day='2026-11-24')=>({id,day,uri:'file:///a.c',path:'/a.c',project:'file:///',projectName:'root',start:1,end:11,dwell:10,active:10,added:5,deleted:5,linesAdded:0,linesDeleted:0,undo:0,redo:0});
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'dashboard-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('strict calendar validation rejects traversal, impossible dates and nonstrings',()=>{for(const d of ['../a','2026-02-30','2026-13-01','2026-00-00',null,{},'2026-1-1','2026-11-24/..'])assert.equal(validDay(d),false);assert(validDay('2024-02-29'));});
test('restart loads prior sessions without duplicate checkpoints',async t=>{const root=await setup(t),a=new Storage(root,'a');await a.save([row()]);await a.save([{...row(),added:8}]);const b=new Storage(root,'b');await b.save([row('2')]);const data=await b.read('2026-11-24');assert.equal(data.rows.length,2);assert.equal(data.rows.reduce((n,r)=>n+r.added,0),13);});
test('parallel windows preserve all records',async t=>{const root=await setup(t);await Promise.all(Array.from({length:20},(_,i)=>new Storage(root,'w'+i).save([row('r'+i)])));assert.equal((await new Storage(root).read('2026-11-24')).rows.length,20);});
test('dates are isolated and old days survive later saves',async t=>{const s=new Storage(await setup(t),'a');await s.save([row(),row('2','2026-11-25')]);await s.save([{...row('2','2026-11-25'),added:7}]);assert.equal((await s.read('2026-11-24')).rows[0].added,5);assert.equal((await s.read('2026-11-25')).rows[0].added,7);});
test('rename failure leaves prior committed data and cleans temporary files',async t=>{const root=await setup(t),s=new Storage(root,'a');await s.save([row()]);const broken=new Storage(root,'a',{...fs,rename:async()=>{throw Error('disk error')}});await assert.rejects(()=>broken.save([{...row(),added:999}]),/disk error/);assert.equal((await s.read('2026-11-24')).rows[0].added,5);assert.equal((await fs.readdir(path.join(root,'records','2026-11-24'))).length,1);});
test('corrupt and invalid records produce warning without dropping valid neighbors',async t=>{const root=await setup(t),s=new Storage(root,'a');await s.save([row()]);const dir=path.join(root,'records','2026-11-24');await fs.writeFile(path.join(dir,'bad.json'),'{');await fs.writeFile(path.join(dir,'bad-schema.json'),'[{}]');await fs.writeFile(path.join(dir,'incomplete.tmp'),'anything');const result=await s.read('2026-11-24');assert.equal(result.rows.length,1);assert.equal(result.warnings.length,1);assert.equal(await fs.readFile(path.join(dir,'bad.json'),'utf8'),'{');});
test('permission errors are reported, not interpreted as empty history',async t=>{const s=new Storage(await setup(t),'a',{...fs,readdir:async()=>{const e=Error('denied');e.code='EACCES';throw e}});await assert.rejects(()=>s.read('2026-11-24'),/denied/);});
test('legacy aliases migrate logically without modifying legacy file',async t=>{const root=await setup(t),s=new Storage(root);await fs.writeFile(path.join(root,'projects.json'),JSON.stringify({a:{alias:'old',task:'ABC-1',type:'Task'}}));await s.patch('a','alias',{alias:'new'});assert.deepEqual((await s.metadata()).a,{alias:'new',task:'ABC-1',type:'Task'});assert.equal(JSON.parse(await fs.readFile(path.join(root,'projects.json'))).a.alias,'old');});
test('parallel project/field changes cannot overwrite unrelated updates',async t=>{const root=await setup(t),a=new Storage(root),b=new Storage(root);await Promise.all([a.patch('a','alias',{alias:'A'}),b.patch('a','task',{task:'ABC-1',type:'SubTask'}),a.patch('b','alias',{alias:'B'})]);assert.deepEqual(await b.metadata(),{a:{alias:'A',task:'ABC-1',type:'SubTask'},b:{alias:'B'}});});
test('corrupt metadata is surfaced rather than silently resetting aliases',async t=>{const root=await setup(t),s=new Storage(root);await fs.writeFile(path.join(root,'projects.json'),'{');await assert.rejects(()=>s.metadata());assert.equal(await fs.readFile(path.join(root,'projects.json'),'utf8'),'{');});
test('invalid counters never reach disk',async t=>{const s=new Storage(await setup(t));await assert.rejects(()=>s.save([{...row(),dwell:-1}]));assert.deepEqual(await s.read('2026-11-24'),{rows:[],warnings:[]});});

test('Windows EPERM rename retries retain old checkpoint until atomic replacement succeeds',async t=>{
 const root=await setup(t),initial=new Storage(root,'a');await initial.save([row()]);
 const delays=[];let attempts=0;
 const s=new Storage(root,'a',{...fs,rename:async(from,to)=>{
  attempts++;assert.equal(JSON.parse(await fs.readFile(to,'utf8'))[0].added,5);
  if(attempts<=3)throw Object.assign(Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`),{code:'EPERM'});
  return fs.rename(from,to);
 }},async ms=>delays.push(ms));
 await s.save([{...row(),added:999}]);assert.equal(attempts,4);assert.deepEqual(delays,[25,50,100]);
 assert.equal((await s.read('2026-11-24')).rows[0].added,999);
 assert.equal((await fs.readdir(path.join(root,'records','2026-11-24'))).length,1);
});
test('permanent EPERM is bounded, preserves JSON and accepts a later retry',async t=>{
 const root=await setup(t),initial=new Storage(root,'a');await initial.save([row()]);let locked=true,attempts=0;
 const s=new Storage(root,'a',{...fs,rename:async(...args)=>{attempts++;if(locked)throw Object.assign(Error('locked'),{code:'EPERM'});return fs.rename(...args);}},async()=>{});
 await assert.rejects(()=>s.save([{...row(),added:999}]),{code:'EPERM'});assert.equal(attempts,7);
 assert.equal((await initial.read('2026-11-24')).rows[0].added,5);assert.equal((await fs.readdir(path.join(root,'records','2026-11-24'))).length,1);
 locked=false;await s.save([{...row(),added:999}]);assert.equal((await initial.read('2026-11-24')).rows[0].added,999);
});
test('EACCES and EBUSY transient locks recover; ENOSPC and missing paths are not retried',async t=>{
 const root=await setup(t);
 for(const code of ['EACCES','EBUSY','ENOSPC','ENOENT']){
  let attempts=0;const s=new Storage(root,code,{...fs,rename:async(...args)=>{if(++attempts===1)throw Object.assign(Error(code),{code});return fs.rename(...args);}},async()=>{});
  if(['EACCES','EBUSY'].includes(code)){await s.save([row()]);assert.equal(attempts,2);}
  else {await assert.rejects(()=>s.save([row()]),{code});assert.equal(attempts,1);}
 }
});
test('same destination writes are ordered even while a Windows rename retries',async t=>{
 const root=await setup(t);let attempts=0,release,entered;const enter=new Promise(r=>entered=r);
 const s=new Storage(root,'a',{...fs,rename:async(...args)=>{if(++attempts===1)throw Object.assign(Error('locked'),{code:'EPERM'});return fs.rename(...args);}},async()=>{entered();await new Promise(r=>release=r);});
 const first=s.save([row()]);await enter;const second=s.save([{...row(),added:8}]);release();await Promise.all([first,second]);
 assert.equal((await s.read('2026-11-24')).rows[0].added,8);assert.equal(s.pending.size,0);
});
test('new metric schema round-trips alongside legacy records and rejects invalid event counters',async t=>{
 const s=new Storage(await setup(t),'a');const modern={...row('2'),metricsVersion:2,keyboardEvents:7,mouseEvents:1,saves:2,changeEvents:3};
 await s.save([row(),modern]);assert.deepEqual((await s.read('2026-11-24')).rows,[row(),modern]);
 for(const value of [-1,1.5,NaN,undefined])await assert.rejects(()=>s.save([{...modern,keyboardEvents:value}]),/Invalid tracking record/);
 assert.equal((await s.read('2026-11-24')).rows.length,2);
});

test('export date enumeration ignores temporary and invalid day names and sorts real days',async t=>{
 const root=await setup(t),s=new Storage(root,'a');assert.deepEqual(await s.dates(),[]);
 await s.save([row('a','2026-11-25'),row('b','2026-11-24')]);await fs.mkdir(path.join(root,'records','2026-02-30'));await fs.mkdir(path.join(root,'records','pending.tmp'));
 assert.deepEqual(await s.dates(),['2026-11-24','2026-11-25']);
});
