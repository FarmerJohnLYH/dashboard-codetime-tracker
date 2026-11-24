'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {timeline,validThreshold}=require('../src/timeline');
const start=new Date(2026,10,24,9).getTime(),minute=60000;
const row=(offset,duration,more={})=>({id:String(offset),start:start+offset*minute,end:start+(offset+duration)*minute,dwell:duration*minute,...more});
test('default 2-minute threshold hides shorter events and retains exact boundary without mutating raw data',()=>{
 const rows=[row(0,1.999),row(5,2),row(10,3)],before=JSON.stringify(rows),result=timeline(rows);
 assert.equal(result.hidden,1);assert.equal(result.visible,2);assert.deepEqual(result.buckets[0].items.map(x=>x.index),[1,2]);assert.equal(JSON.stringify(rows),before);
});
test('cross-slot events retain original identity and are filtered before segmentation',()=>{
 const result=timeline([row(29,2),row(35,45)]);
 assert.deepEqual(result.buckets.map(b=>new Date(b.start).getMinutes()),[0,30,0]);
 const first=result.buckets[0].items[0];assert.equal(first.start,start+29*minute);assert.equal(first.end,start+30*minute);assert(first.continues);assert(!first.continued);
 const continuation=result.buckets[1].items[0];assert.equal(continuation.index,0);assert(continuation.continued);assert(!continuation.continues);
 assert.equal(result.visible,2);assert.equal(result.buckets.flatMap(b=>b.items).length,4);
});
test('exclusive interval end avoids manufacturing a next-slot card',()=>{
 const result=timeline([row(0,30),row(30,30)]);assert.equal(result.buckets.length,2);assert.equal(result.buckets[0].items.length,1);assert.equal(result.buckets[1].items.length,1);
});
test('zero threshold includes instantaneous external changes and unfiltered point records',()=>{
 const result=timeline([row(5,0),row(10,1)],0);assert.equal(result.visible,2);assert.equal(result.hidden,0);assert.equal(result.buckets[0].items[0].start,result.buckets[0].items[0].end);
});
test('filter uses dwell rather than wall clock gap or summed project duration',()=>{
 const result=timeline([row(0,60,{dwell:minute}),row(70,60,{dwell:minute})]);assert.equal(result.hidden,2);assert.equal(result.buckets.length,0);
});
test('invalid threshold falls back to 2; fractional values and zero are supported',()=>{
 for(const x of [NaN,Infinity,-1,1441,'2',null,undefined]){assert.equal(validThreshold(x),false);assert.equal(timeline([row(0,1)],x).hidden,1);}
 for(const x of [0,.5,2,1440])assert(validThreshold(x));
 assert.equal(timeline([row(0,.5)],.5).visible,1);
});
test('events and half-hour groups sort chronologically without changing input order',()=>{
 const rows=[row(65,3),row(15,3),row(5,3),row(10,3)];const result=timeline(rows);
 assert.deepEqual(result.buckets.map(x=>x.start),[start,start+60*minute]);assert.deepEqual(result.buckets[0].items.map(x=>x.index),[2,3,1]);assert.equal(rows[0].start,start+65*minute);
});
test('invalid dates are ignored and abnormally long ranges are bounded to one local day',()=>{
 assert.equal(timeline([row(0,3,{start:NaN}),row(0,3,{end:Infinity}),row(0,3,{end:0}),row(0,3,{start:1e20,end:1e20})]).visible,0);
 assert(timeline([row(0,365*24*60)]).buckets.length<=50);
});
test('DST fall-back buckets preserve separate occurrences; spring-forward skips nonexistent times',()=>{
 const {execFileSync}=require('node:child_process');
 const script=`const assert=require('node:assert/strict'),{timeline}=require('./src/timeline');const mk=(a,b)=>({start:Date.parse(a),end:Date.parse(b),dwell:1800000});const fall=timeline([mk('2026-11-01T01:35:00-04:00','2026-11-01T01:40:00-05:00')]);assert.equal(fall.buckets.length,3);assert.equal(new Date(fall.buckets[0].start).getTimezoneOffset(),240);assert.equal(new Date(fall.buckets[2].start).getTimezoneOffset(),300);assert.equal(new Date(fall.buckets[0].start).getMinutes(),30);assert.equal(new Date(fall.buckets[2].start).getMinutes(),30);const spring=timeline([mk('2026-03-08T01:50:00-05:00','2026-03-08T03:10:00-04:00')]);assert.deepEqual(spring.buckets.map(b=>new Date(b.start).getHours()),[1,3]);`;
 execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ:'America/New_York'}});
});
