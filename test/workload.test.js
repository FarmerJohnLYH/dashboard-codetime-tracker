'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Tracker,summarize}=require('../src/core');
const base=new Date(2026,10,24,9).getTime();
const a={uri:'file:///one/c425kv1/a.c',path:'/one/c425kv1/a.c',project:'file:///one/c425kv1',projectName:'c425kv1'};
const b={...a,uri:'vscode-remote://ssh-remote+host/two/c425kv1/a.c',path:'/two/c425kv1/a.c',project:'vscode-remote://ssh-remote+host/two/c425kv1'};
const change=(text,rangeLength=0)=>({text,rangeLength,range:{start:{line:0},end:{line:0}}});
function rows(){return [a,b].map((target,i)=>({...target,id:String(i),dwell:(i+1)*60000,active:10000,added:1,deleted:0,linesAdded:0,linesDeleted:0,undo:0,redo:0}));}
test('same names merge dwell automatically without Jira and preserve full paths',()=>{
 const [g]=summarize(rows(),{});assert.equal(summarize(rows(),{}).length,1);
 assert.equal(g.dwell,180000);assert.equal(g.active,20000);assert.equal(g.files.length,2);assert.equal(g.changedFiles,2);
 assert.deepEqual(g.projects,[a.project,b.project]);assert.equal(g.hours,undefined);
});
test('effective aliases merge across names and different aliases separate a same-name group',()=>{
 const input=rows();input[1].projectName='different';
 assert.equal(summarize(input,{[b.project]:{alias:' c425kv1 '}}).length,1);
 input[1].projectName='c425kv1';assert.equal(summarize(input,{[b.project]:{alias:'separate'}}).length,2);
 assert.equal(summarize(input,{[b.project]:{alias:'C425kv1'}}).length,2);
});
test('legacy Jira metadata is retained externally but omitted from project summaries',()=>{
 const metadata={[a.project]:{task:'A-1',type:'Task'}},[g]=summarize(rows(),metadata);
 assert.equal(g.task,undefined);assert.equal(g.tasks,undefined);assert.equal(metadata[a.project].task,'A-1');
});
test('repeated sessions of one URI count one changed file',()=>{
 const input=rows();input[1]={...input[0],id:'2'};
 const [g]=summarize(input);assert.equal(g.files.length,1);assert.equal(g.changedFiles,1);assert.equal(g.added,2);
});
test('cherry-pick-like full replacements never count as keyboard activity or reset idle',()=>{
 const t=new Tracker(1000);t.set(a,true,base);t.edit(a,[change('x'.repeat(20000),16000)],undefined,base+2000);t.tick(base+3000);
 assert.equal(t.rows[0].changeEvents,1);assert.equal(t.rows[0].added,20000);assert.equal(t.rows[0].keyboardEvents,0);
 assert.equal(t.rows[0].active,1000);
});
test('multi-cursor, paste, formatter, undo and redo count document events rather than characters as keys',()=>{
 const t=new Tracker();t.set(a,true,base);
 t.edit(a,[change('hello'),change('world')],undefined,base+1);
 t.interaction('keyboardEvents',base+2);
 t.edit(a,[change('paste'.repeat(1000))],undefined,base+3);
 t.edit(a,[change('',5)],1,base+4);t.edit(a,[change('again')],2,base+5);
 t.save(a,base+6);t.interaction('mouseEvents',base+7);
 const r=t.rows[0];assert.equal(r.changeEvents,4);assert.equal(r.keyboardEvents,1);assert.equal(r.saves,1);assert.equal(r.mouseEvents,1);assert.equal(r.undo,1);assert.equal(r.redo,1);
});
test('background saves and edits get zero keyboard events and dwell',()=>{
 const t=new Tracker();t.set(a,true,base);t.save(b,base+1);t.edit(b,[change('x')],undefined,base+2);
 const r=t.rows.find(r=>r.uri===b.uri);assert.equal(r.dwell,0);assert.equal(r.keyboardEvents,0);assert.equal(r.saves,1);
 t.set(a,false,base+3);t.interaction('keyboardEvents',base+4);assert.equal(t.rows.reduce((n,r)=>n+r.keyboardEvents,0),0);
});
test('legacy metrics stay unknown rather than retroactively inventing keys or saves',()=>{
 const t=new Tracker();t.set(a,true,base);t.interaction('keyboardEvents',base+1);
 const [g]=summarize([...rows(),...t.rows]);assert.equal(g.legacyRecords,2);assert.equal(g.measuredRecords,1);assert.equal(g.keyboardEvents,1);
});
