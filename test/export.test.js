'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildExport}=require('../src/export');
const row={id:'one',day:'2026-11-24',start:10,end:20,uri:'file:///work/a.c',path:'/work/a.c',project:'file:///work',projectName:'work',dwell:10,active:5,added:1,deleted:0};
function storage(){return {dates:async()=>['2026-11-23','2026-11-24'],read:async date=>({rows:date===row.day?[row]:[{...row,id:'old',day:date}],warnings:[]}),metadata:async()=>({'file:///work':{alias:'new',task:'OLD-1'}})};}
test('all export preserves original fields, legacy unknowns, metadata and units; newest live checkpoint wins',async()=>{
 const data=await buildExport(storage(),[{...row,added:8}],{scope:'all',now:0});
 assert.equal(data.exportedAt,'1970-01-01T00:00:00.000Z');assert.equal(data.records.length,2);assert.equal(data.records[1].added,8);
 assert.equal(data.records[1].keyboardEvents,undefined);assert.equal(data.projects[row.project].task,'OLD-1');assert.equal(data.units.dwell,'milliseconds');assert.equal(data.records[1].name,undefined);
});
test('new in-memory dates are exported even before the first disk checkpoint',async()=>{
 const data=await buildExport({...storage(),dates:async()=>[],read:async()=>({rows:[],warnings:[]})},[row],{scope:'all'});
 assert.deepEqual(data.scope.dates,[row.day]);assert.deepEqual(data.records,[row]);
});
test('raw export is a stable snapshot even when live records mutate during disk reads',async()=>{
 const live={...row};const store={...storage(),read:async()=>{live.added=99;return {rows:[],warnings:[]};}};
 const data=await buildExport(store,[live],{scope:'day',date:row.day});assert.equal(data.records[0].added,1);
});
test('invalid export scope, unreadable directories and metadata errors cannot silently produce empty success',async()=>{
 await assert.rejects(()=>buildExport(storage(),[],{scope:'day',date:'../x'}),/Invalid export scope/);
 await assert.rejects(()=>buildExport(storage(),[],{scope:'unknown'}),/Invalid export scope/);
 await assert.rejects(()=>buildExport({...storage(),dates:async()=>{throw Error('EACCES');}},[],{scope:'all'}),/EACCES/);
 await assert.rejects(()=>buildExport({...storage(),metadata:async()=>{throw Error('corrupt metadata');}},[],{scope:'day',date:row.day}),/corrupt metadata/);
});
test('empty dates export a valid empty array, not invented zero metrics',async()=>{
 const data=await buildExport({...storage(),read:async()=>({rows:[],warnings:[]})},[],{scope:'day',date:row.day});assert.deepEqual(data.records,[]);
});

test('single-day export includes only relevant project metadata; all-history preserves the full metadata',async()=>{
 const metadata={...await storage().metadata(),other:{alias:'another day',task:'OTHER-2'}},store={...storage(),metadata:async()=>metadata};
 const current=await buildExport(store,[],{scope:'day',date:row.day});assert.equal(current.projects.other,undefined);
 const all=await buildExport(store,[],{scope:'all'});assert.equal(all.projects.other.task,'OTHER-2');
});
test('records with the same legacy id on different dates are not accidentally collapsed',async()=>{
 const store={...storage(),read:async date=>({rows:[{...row,day:date}],warnings:[]})};
 const data=await buildExport(store,[],{scope:'all'});assert.equal(data.records.length,2);
});
