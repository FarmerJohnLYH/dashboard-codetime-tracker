const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Storage}=require('../src/storage');
async function harness(t,{nontext=false,seed=[]}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dashboard-life-')),callbacks={},messages=[],errors=[],infos=[],warnings=[],disposables=[];
 if(seed.length)await new Storage(root,'prior').save(seed);
 const event=k=>fn=>{callbacks[k]=fn;return {dispose(){}}};let pane,interval,input,choice='Task',status,destination;const settings={idleMinutes:5,timelineMinMinutes:2},updates=[];
 const doc={uri:{scheme:'file',fsPath:'/a/main.c',toString:()=> 'file:///a/main.c'}};
 const v={ConfigurationTarget:{Global:1,Workspace:2},TextEditorSelectionChangeKind:{Keyboard:1,Mouse:2,Command:3},Uri:{joinPath:()=>({}),file:fsPath=>({fsPath})},StatusBarAlignment:{Left:1,Right:2},ViewColumn:{Active:1},window:{activeTextEditor:{document:doc},state:{focused:true},createStatusBarItem:(alignment,priority)=>status={alignment,priority,show(){},dispose(){}},onDidChangeActiveTextEditor:event('editor'),onDidChangeWindowState:event('focus'),onDidChangeTextEditorSelection:event('selection'),onDidChangeTextEditorVisibleRanges:event('scroll'),showErrorMessage:m=>errors.push(m),showInputBox:async()=>input,showSaveDialog:async()=>destination,showInformationMessage:m=>infos.push(m),showWarningMessage:m=>warnings.push(m),showQuickPick:async()=>choice,createWebviewPanel:()=>pane={active:true,visible:true,webview:{postMessage:d=>messages.push(d),onDidReceiveMessage:event('message')},onDidDispose:event('dispose'),onDidChangeViewState:event('view'),reveal(){}}},workspace:{fs:{writeFile:(uri,bytes)=>fs.writeFile(uri.fsPath,bytes)},getWorkspaceFolder:()=>({name:'a',uri:{toString:()=> 'file:///a'}}),getConfiguration:()=>({get:(key,fallback)=>settings[key]??fallback,update:async(key,value,target)=>{settings[key]=value;updates.push({key,value,target});}}),onDidChangeConfiguration:event('config'),onDidSaveTextDocument:event('save'),onDidChangeTextDocument:event('edit')},commands:{registerCommand:(k,fn)=>{callbacks[k]=fn;return {dispose(){}}}}};
 if(nontext){v.TabInputText=class{};v.window.tabGroups={activeTabGroup:{activeTab:{input:{}}}};}
 const load=Module._load,si=global.setInterval,ci=global.clearInterval;delete require.cache[require.resolve('../src/extension')];Module._load=function(id,...rest){return id==='vscode'?v:load.call(this,id,...rest)};const ext=require('../src/extension');Module._load=load;
 global.setInterval=fn=>{interval=fn;return 1};global.clearInterval=()=>{};
 const context={globalStorageUri:{fsPath:root},extensionPath:path.resolve(__dirname,'..'),subscriptions:disposables};await ext.activate(context);
 t.after(async()=>{await ext.deactivate();global.setInterval=si;global.clearInterval=ci;await fs.rm(root,{recursive:true,force:true});});
 return {root,v,settings,updates,callbacks,ext,context,messages,errors,infos,warnings,destination:x=>destination=x,get pane(){return pane},get status(){return status},input:x=>input=x,choice:x=>choice=x,tick:()=>interval(),open:()=>callbacks['dashboard.open'](),ready:()=>callbacks.message({type:'ready'}),edit:()=>callbacks.edit({document:doc,contentChanges:[{text:'x',rangeLength:0,range:{start:{line:0},end:{line:0}}}]})};
}
function statusRow(id,date,dwell){
 const start=new Date(date+'T00:00:00').getTime();
 return {id,day:date,uri:'file:///history/'+id+'.c',path:'/history/'+id+'.c',project:'file:///history/'+id,projectName:id,start,end:start+dwell,dwell,active:0,added:0,deleted:0,linesAdded:0,linesDeleted:0,undo:0,redo:0};
}
test('lifecycle regressions',async t=>{
 await t.test('concurrent open requests create one panel and close during read is safe',async t=>{const h=await harness(t);h.edit();await Promise.all([h.open(),h.open()]);const original=Storage.prototype.read;let release,entered;const enter=new Promise(r=>entered=r);Storage.prototype.read=async function(d){entered();await new Promise(r=>release=r);return original.call(this,d)};try{const pending=h.ready();await enter;h.callbacks.dispose();release();await pending;assert.equal(h.messages.length,0);assert.equal(h.errors.length,0);}finally{Storage.prototype.read=original;}});
 await t.test('late previous-date response cannot overwrite newer date',async t=>{const h=await harness(t);h.edit();await h.open();await h.ready();const original=Storage.prototype.read;let release,entered;const enter=new Promise(r=>entered=r);Storage.prototype.read=async function(d){if(d==='2026-10-01'){entered();await new Promise(r=>release=r);}return original.call(this,d)};try{const old=h.callbacks.message({type:'date',value:'2026-10-01'});await enter;await h.callbacks.message({type:'date',value:'2026-10-02'});release();await old;assert.equal(h.messages.at(-1).date,'2026-10-02');}finally{Storage.prototype.read=original;}});
 await t.test('actual deactivate/reactivate preserves history and aliases; removed task messages are ignored',async t=>{const h=await harness(t);h.edit();await h.open();await h.ready();h.input('改名');await h.callbacks.message({type:'edit',project:'file:///a',field:'alias'});h.input('DEMO-123');h.choice('SubTask');await h.callbacks.message({type:'edit',project:'file:///a',field:'task'});await h.ext.deactivate();await h.ext.activate(h.context);await h.open();await h.ready();assert.equal(h.messages.at(-1).groups[0].name,'改名');assert.equal(h.messages.at(-1).groups[0].task,undefined);assert.equal((await new Storage(h.root).metadata())['file:///a'].task,undefined);assert.equal(h.messages.at(-1).groups[0].added,1);});
 await t.test('cancel dialogs and unknown projects never change metadata',async t=>{const h=await harness(t);h.edit();await h.open();await h.ready();h.input(undefined);await h.callbacks.message({type:'edit',project:'file:///a',field:'alias'});h.input('ABC-1');h.choice(undefined);await h.callbacks.message({type:'edit',project:'file:///a',field:'task'});await h.callbacks.message({type:'edit',project:'file:///unknown',field:'alias'});assert.deepEqual(await new Storage(h.root).metadata(),{});});
 await t.test('invalid messages and impossible dates do not crash or change view',async t=>{const h=await harness(t);await h.open();await h.ready();const before=h.messages.length;for(const m of [null,[],{type:'date',value:'2026-99-01'},{type:'date',value:'../../x'},{type:'edit',project:{},field:'alias'}])await h.callbacks.message(m);assert.equal(h.messages.length,before);assert.equal(h.errors.length,0);});
 await t.test('Dashboard view stops attribution while split editor remains visible',async t=>{const h=await harness(t),real=Date.now;let time=real();Date.now=()=>time;try{time+=1000;h.edit();await h.open();time+=10000;h.tick();await h.ready();const g=h.messages.at(-1).groups[0];assert(g.dwell<2000);assert.equal(g.added,1);}finally{Date.now=real;}});
 await t.test('save failure is retryable and only reported once',async t=>{const h=await harness(t);h.edit();await h.open();const orig=Storage.prototype.save;Storage.prototype.save=async()=>{throw Error('disk full')};try{await h.ready();await h.ready();assert.equal(h.errors.filter(x=>x.includes('disk full')).length,1);}finally{Storage.prototype.save=orig;}await h.ready();assert.equal(h.messages.at(-1).groups[0].added,1);});
 await t.test('ticks during slow writes are not lost or written concurrently',async t=>{const h=await harness(t);h.edit();await h.open();const orig=Storage.prototype.save;let release,entered,count=0,active=0,peak=0;const enter=new Promise(r=>entered=r);Storage.prototype.save=async function(rows){active++;peak=Math.max(peak,active);try{if(++count===1){entered();await new Promise(r=>release=r);}await orig.call(this,rows);}finally{active--;}};try{const pending=h.ready();await enter;for(let i=0;i<50;i++){h.edit();h.tick();}release();await pending;await h.ready();assert.equal(h.messages.at(-1).groups[0].added,51);assert.equal(peak,1);}finally{Storage.prototype.save=orig;}});
 await t.test('only foreground current-editor activity extends active time',async t=>{const h=await harness(t),real=Date.now;let time=real();Date.now=()=>time;try{h.callbacks.selection({textEditor:h.v.window.activeTextEditor});time+=1000;h.callbacks.scroll({textEditor:h.v.window.activeTextEditor});h.callbacks.selection({textEditor:{document:{uri:{toString:()=> 'file:///other'}}}});h.v.window.state.focused=false;h.callbacks.focus();h.callbacks.selection({textEditor:h.v.window.activeTextEditor});h.callbacks.config();h.v.window.state.focused=true;h.callbacks.focus();h.edit();await h.open();await h.ready();assert.equal(h.errors.length,0);assert(h.messages.at(-1).groups[0].active<=h.messages.at(-1).groups[0].dwell);}finally{Date.now=real;}});
 await t.test('nontext tabs and unsupported documents create no time or edits',async t=>{const h=await harness(t,{nontext:true});h.callbacks.editor();h.tick();h.callbacks.edit({document:{uri:{scheme:'untitled'}},contentChanges:[{}]});await h.open();await h.ready();assert.equal(h.messages.at(-1).groups.length,0);});

 await t.test('old-day pruning never overwrites a full day with one retained session',async t=>{const h=await harness(t),real=Date.now;let time=real();const firstDay=require('../src/core').day(time);Date.now=()=>time;try{h.edit();h.v.window.state.focused=false;h.callbacks.focus();time+=1000;h.v.window.state.focused=true;h.callbacks.focus();h.edit();await h.open();await h.ready();const before=(await new Storage(h.root).read(firstDay)).rows.reduce((s,r)=>s+r.added,0);time+=3*86400000;h.tick();await h.ready();h.tick();await h.ready();assert.equal((await new Storage(h.root).read(firstDay)).rows.reduce((s,r)=>s+r.added,0),before);}finally{Date.now=real;}});

 await t.test('right status starts at zero and remains a dashboard shortcut',async t=>{
  const h=await harness(t,{nontext:true});
  assert.equal(h.status.alignment,h.v.StatusBarAlignment.Right);
  assert.equal(h.status.text,'$(code) 00:00');assert.equal(h.status.command,'dashboard.open');
  await h.open();assert(h.pane);
 });
 await t.test('startup sums all today projects using dwell and ignores the viewed historical day',async t=>{
  const date=require('../src/core').day(Date.now());
  const h=await harness(t,{nontext:true,seed:[statusRow('a',date,60*60000),statusRow('b',date,65*60000+59999),statusRow('old','2020-01-01',12*3600000)]});
  assert.equal(h.status.text,'$(code) 02:05');
  await h.open();await h.callbacks.message({type:'date',value:'2020-01-01'});
  assert.equal(h.status.text,'$(code) 02:05');
 });
 await t.test('timer includes live time once, updates other windows and restores after restart',async t=>{
  const real=Date.now;let now=new Date(2026,10,24,9).getTime();Date.now=()=>now;
  try{
   const h=await harness(t,{seed:[statusRow('history','2026-11-24',59*60000)]});
   for(let i=0;i<6;i++){now+=10000;await h.tick();}
   assert.equal(h.status.text,'$(code) 01:00');
   await h.open();await h.ready();await h.tick();assert.equal(h.status.text,'$(code) 01:00');
   await new Storage(h.root,'other-window').save([statusRow('other','2026-11-24',30*60000)]);
   await h.tick();assert.equal(h.status.text,'$(code) 01:30');
   await h.ext.deactivate();await h.ext.activate(h.context);assert.equal(h.status.text,'$(code) 01:30');
  }finally{Date.now=real;}
 });
 await t.test('status resets at local midnight rather than showing yesterday total',async t=>{
  const real=Date.now;let now=new Date(2026,10,24,23,59,55).getTime();Date.now=()=>now;
  try{
   const h=await harness(t,{seed:[statusRow('history','2026-11-24',2*3600000)]});assert.equal(h.status.text,'$(code) 02:00');
   now+=10000;await h.tick();assert.equal(h.status.text,'$(code) 00:00');
   for(let i=0;i<6;i++){now+=10000;await h.tick();}assert.equal(h.status.text,'$(code) 00:01');
  }finally{Date.now=real;}
 });
 await t.test('out-of-order status reads and deactivation never overwrite current display',async t=>{
  const h=await harness(t,{nontext:true}),orig=Storage.prototype.read;let release,entered;
  const enter=new Promise(r=>entered=r);let calls=0;
  Storage.prototype.read=async function(date){if(++calls===1){entered();await new Promise(r=>release=r);return {rows:[statusRow('stale',date,9*3600000)],warnings:[]};}return orig.call(this,date);};
  try{
   const old=h.tick();await enter;await h.tick();assert.equal(h.status.text,'$(code) 00:00');
   release();await old;assert.equal(h.status.text,'$(code) 00:00');
   calls=0;const pending=h.tick();await new Promise(r=>setImmediate(r));const item=h.status;
   await h.ext.deactivate();release();await pending;assert.equal(item.text,'$(code) 00:00');
  }finally{Storage.prototype.read=orig;}
 });
 await t.test('failed status reads retain time and report the error without changing the requested format',async t=>{
  const date=require('../src/core').day(Date.now()),h=await harness(t,{nontext:true,seed:[statusRow('history',date,3600000)]}),orig=Storage.prototype.read;
  Storage.prototype.read=async()=>{throw Error('read denied')};
  try{await h.tick();assert.equal(h.status.text,'$(code) 01:00');assert(h.status.tooltip.includes('read denied'));assert(h.errors.some(e=>e.includes('read denied')));}finally{Storage.prototype.read=orig;}
  await h.tick();assert.equal(h.status.text,'$(code) 01:00');
 });

 await t.test('keyboard selection is counted once; mouse, commands, background and bulk replacements stay separate',async t=>{
  const h=await harness(t),editor=h.v.window.activeTextEditor;
  h.callbacks.selection({textEditor:editor,kind:1,selections:[{},{}]});
  h.callbacks.selection({textEditor:editor,kind:2});
  h.callbacks.selection({textEditor:editor,kind:3});
  h.callbacks.selection({textEditor:editor});
  h.edit();h.callbacks.save(editor.document);
  h.callbacks.selection({textEditor:{document:{uri:{toString:()=> 'file:///other'}}},kind:1});
  h.v.window.state.focused=false;h.callbacks.focus();h.callbacks.selection({textEditor:editor,kind:1});
  await h.open();await h.ready();const g=h.messages.at(-1).groups[0];
  assert.equal(g.keyboardEvents,1);assert.equal(g.mouseEvents,1);assert.equal(g.changeEvents,1);assert.equal(g.saves,1);
 });
 await t.test('merged alias edits apply to all member paths; removed Jira editing cannot change history',async t=>{
  const date=require('../src/core').day(Date.now());
  const seed=[statusRow('one',date,1000),statusRow('two',date,2000)].map(r=>({...r,projectName:'same'}));
  const h=await harness(t,{nontext:true,seed});await h.open();await h.ready();
  assert.equal(h.messages.at(-1).groups.length,1);
  h.input('merged');await h.callbacks.message({type:'edit',project:seed[0].project,field:'alias'});
  h.input('DEMO-77');await h.callbacks.message({type:'edit',project:seed[0].project,field:'task'});
  const meta=await new Storage(h.root).metadata();
  for(const r of seed){assert.equal(meta[r.project].alias,'merged');assert.equal(meta[r.project].task,undefined);}
  await h.ext.deactivate();await h.ext.activate(h.context);await h.open();await h.ready();
  const groups=h.messages.at(-1).groups;assert.equal(groups.length,1);assert.equal(groups[0].dwell,3000);assert.equal(groups[0].files.length,2);
 });
 await t.test('EPERM exhaustion keeps live edits visible with a warning and later flush persists them once',async t=>{
  const h=await harness(t);h.edit();await h.open();const orig=Storage.prototype.save;
  Storage.prototype.save=async()=>{throw Object.assign(Error('EPERM: operation not permitted, rename'),{code:'EPERM'});};
  try{await h.ready();await h.ready();assert.equal(h.messages.at(-1).groups[0].added,1);assert(h.messages.at(-1).warnings.some(w=>w.includes('尚未保存')));assert.equal(h.errors.length,1);}
  finally{Storage.prototype.save=orig;}
  await h.ready();assert.equal(h.messages.at(-1).warnings.length,0);assert.equal(h.messages.at(-1).groups[0].added,1);
  assert.equal((await new Storage(h.root).read(require('../src/core').day(Date.now()))).rows.reduce((n,r)=>n+r.added,0),1);
 });

 await t.test('export button writes selected raw JSON including live data without counting it twice',async t=>{
  const h=await harness(t);h.edit();await h.open();await h.ready();
  h.choice({scope:'day'});const output=path.join(h.root,'export.json');h.destination({fsPath:output});
  await h.callbacks.message({type:'export'});
  const data=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(data.schemaVersion,1);assert.equal(data.scope.kind,'day');
  assert.equal(data.records.reduce((n,r)=>n+r.added,0),1);assert.equal(data.records[0].uri,'file:///a/main.c');assert.equal(h.infos.length,1);
 });
 await t.test('export current date follows the selected historical day; all-history includes other dates',async t=>{
  const today=require('../src/core').day(Date.now());const h=await harness(t,{nontext:true,seed:[statusRow('old','2020-01-01',1000),statusRow('today',today,2000)]});
  await h.open();await h.callbacks.message({type:'date',value:'2020-01-01'});
  const output=path.join(h.root,'export.json');h.destination({fsPath:output});h.choice({scope:'day'});
  await h.callbacks['dashboard.export']();let data=JSON.parse(await fs.readFile(output,'utf8'));assert.deepEqual(data.scope.dates,['2020-01-01']);assert.equal(data.records.length,1);
  h.choice({scope:'all'});await h.callbacks['dashboard.export']();data=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(data.records.length,2);
 });
 await t.test('canceling scope or save dialog never writes an export or reports success',async t=>{
  const h=await harness(t);let writes=0;h.v.workspace.fs.writeFile=async()=>writes++;
  h.choice(undefined);await h.callbacks['dashboard.export']();h.choice({scope:'all'});h.destination(undefined);await h.callbacks['dashboard.export']();
  assert.equal(writes,0);assert.equal(h.infos.length,0);assert.equal(h.errors.length,0);
 });
 await t.test('export retains unflushed memory on storage error, reports destination errors, and can retry',async t=>{
  const h=await harness(t);h.edit();h.choice({scope:'all'});const output=path.join(h.root,'export.json');h.destination({fsPath:output});
  const save=Storage.prototype.save;Storage.prototype.save=async()=>{throw Object.assign(Error('EPERM saving records'),{code:'EPERM'});};
  try{await h.callbacks['dashboard.export']();assert.equal(JSON.parse(await fs.readFile(output,'utf8')).records[0].added,1);}finally{Storage.prototype.save=save;}
  const write=h.v.workspace.fs.writeFile;h.v.workspace.fs.writeFile=async()=>{throw Object.assign(Error('ENOSPC export target'),{code:'ENOSPC'});};
  await h.callbacks['dashboard.export']();assert.equal(h.infos.length,1);assert(h.errors.some(e=>e.includes('ENOSPC export target')));
  h.v.workspace.fs.writeFile=write;await h.callbacks['dashboard.export']();assert.equal(h.infos.length,2);
 });
 await t.test('corrupt source records remain intact and export explicitly warns about incomplete data',async t=>{
  const date=require('../src/core').day(Date.now()),h=await harness(t,{seed:[statusRow('good',date,1000)]});
  const broken=path.join(h.root,'records',date,'broken.json');await fs.writeFile(broken,'{');h.choice({scope:'all'});const output=path.join(h.root,'export.json');h.destination({fsPath:output});
  await h.callbacks['dashboard.export']();const data=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(data.warnings.length,1);assert.equal(h.warnings.length,1);assert.equal(h.infos.length,0);assert.equal(await fs.readFile(broken,'utf8'),'{');
 });
 await t.test('concurrent export requests share one dialog and one write',async t=>{
  const h=await harness(t);let release,dialogs=0,writes=0;
  h.v.window.showQuickPick=async()=>{dialogs++;await new Promise(r=>release=r);return {scope:'day'};};h.destination({fsPath:path.join(h.root,'export.json')});h.v.workspace.fs.writeFile=async()=>writes++;
  const first=h.callbacks['dashboard.export'](),second=h.callbacks['dashboard.export']();release();await Promise.all([first,second]);assert.equal(dialogs,1);assert.equal(writes,1);
 });

 await t.test('timeline threshold defaults to 2, persists valid changes, and never changes table totals or raw export',async t=>{
  const date=require('../src/core').day(Date.now()),h=await harness(t,{nontext:true,seed:[statusRow('short',date,60000),statusRow('long',date,120000)]});
  await h.open();await h.ready();let data=h.messages.at(-1);assert.equal(data.timeline.hidden,1);assert.equal(data.timeline.visible,1);assert.equal(data.groups.length,2);
  await h.callbacks.message({type:'timelineThreshold',value:0});data=h.messages.at(-1);assert.equal(data.timeline.visible,2);assert.equal(h.updates[0].target,1);
  for(const value of [-1,1441,'2',null,Infinity])await h.callbacks.message({type:'timelineThreshold',value});assert.equal(h.updates.length,1);
  h.settings.timelineMinMinutes=3;await h.callbacks.config();await h.ready();assert.equal(h.messages.at(-1).timeline.visible,0);
  h.choice({scope:'day'});const output=path.join(h.root,'unfiltered.json');h.destination({fsPath:output});await h.callbacks['dashboard.export']();assert.equal(JSON.parse(await fs.readFile(output,'utf8')).records.length,2);
 });
 await t.test('configuration write failure reports error and retains the prior threshold',async t=>{
  const h=await harness(t);await h.open();await h.ready();h.v.workspace.getConfiguration=()=>({get:(k,d)=>h.settings[k]??d,update:async()=>{throw Error('settings write denied');}});
  await h.callbacks.message({type:'timelineThreshold',value:0});assert(h.errors.some(e=>e.includes('settings write denied')));assert.equal(h.settings.timelineMinMinutes,2);
 });

 await t.test('timeline control updates an existing workspace override instead of a shadowed global setting',async t=>{
  const h=await harness(t);await h.open();let target;
  h.v.workspace.getConfiguration=()=>({get:(k,d)=>h.settings[k]??d,inspect:()=>({workspaceValue:2}),update:async(k,v,t)=>{h.settings[k]=v;target=t;}});
  await h.callbacks.message({type:'timelineThreshold',value:.5});assert.equal(target,2);assert.equal(h.messages.at(-1).timeline.minMinutes,.5);
 });

});
