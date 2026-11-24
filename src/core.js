 'use strict';
const crypto = require('crypto');
const day = t => {const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const rounded = ms => Math.floor(ms/1800000+0.5)/2;
function count(changes) {return changes.reduce((a,c)=>({added:a.added+c.text.length,deleted:a.deleted+c.rangeLength,linesAdded:a.linesAdded+(c.text.match(/\n/g)||[]).length,linesDeleted:a.linesDeleted+c.range.end.line-c.range.start.line}),{added:0,deleted:0,linesAdded:0,linesDeleted:0});}
class Tracker {
 constructor(idle=300000){this.idle=idle;this.rows=[];this.current=null;this.last=null;this.activeAt=0;this.focus=false;}
 set(target,focus,t){this.tick(t);if(this.focus===focus&&this.target?.uri===target?.uri)return;this.current=null;this.target=target;this.focus=focus;this.last=t;this.activeAt=t;}
 activity(t){this.tick(t);if(this.focus)this.activeAt=t;}
 row(t,target=this.target){if(!target)return null; if(target===this.target && this.current && this.current.day===day(t))return this.current;
 if(target!==this.target){const existing=this.rows.findLast(r=>r.uri===target.uri&&r.dwell===0&&Math.floor(r.start/60000)===Math.floor(t/60000));if(existing)return existing;}
 const r={id:crypto.randomUUID(),day:day(t),...target,start:t,end:t,dwell:0,active:0,added:0,deleted:0,linesAdded:0,linesDeleted:0,undo:0,redo:0};this.rows.push(r);if(target===this.target)this.current=r;return r;}
 tick(t){if(this.last===null){this.last=t;return;}const from=this.last;this.last=t;
 if(t<from){this.current=null;this.activeAt=t;return;}
 if(!this.focus||!this.target||t===from)return;
 if(t-from>30000){this.current=null;return;} // sleep / stalled host is never billed
 let cursor=from;
 while(cursor<t){const d=new Date(cursor);d.setHours(24,0,0,0);const end=Math.min(t,d.getTime());const r=this.row(cursor);r.dwell+=end-cursor;r.active+=Math.max(0,Math.min(end,this.activeAt+this.idle)-cursor);r.end=end;cursor=end;}
 }
 edit(target,changes,reason,t){this.tick(t);if(!changes.length)return;const r=this.row(t,this.target&&target.uri===this.target.uri?this.target:target);r.end=Math.max(r.end,t);const c=count(changes);for(const k of Object.keys(c))r[k]+=c[k];if(reason===1)r.undo++;if(reason===2)r.redo++;if(this.target&&target.uri===this.target.uri)this.activeAt=t;}
}
function summarize(rows,meta){const groups=new Map();for(const r of rows){const m=meta[r.project]||{};const key=r.project;let g=groups.get(key);if(!g){g={project:key,name:m.alias||r.projectName,task:m.task||'',type:m.type||'Task',dwell:0,active:0,added:0,deleted:0,files:[]};groups.set(key,g);}for(const k of ['dwell','active','added','deleted'])g[k]+=r[k];let f=g.files.find(f=>f.uri===r.uri);if(!f){f={uri:r.uri,path:r.path,dwell:0,active:0,added:0,deleted:0};g.files.push(f);}for(const k of ['dwell','active','added','deleted'])f[k]+=r[k];}
 const tasks=new Map(),members=new Map();for(const g of groups.values())if(g.task){tasks.set(g.task,(tasks.get(g.task)||0)+g.dwell);members.set(g.task,(members.get(g.task)||0)+1);}
 const seen=new Set();return [...groups.values()].map(g=>({...g,hours:g.task&&!seen.has(g.task)?(seen.add(g.task),rounded(tasks.get(g.task))):null,shared:!!g.task&&members.get(g.task)>1}));}
module.exports={Tracker,day,count,rounded,summarize};
