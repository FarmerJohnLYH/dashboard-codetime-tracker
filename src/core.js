 'use strict';
const crypto = require('crypto');
const day = t => {const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const eventCounters = ['changeEvents','keyboardEvents','mouseEvents','saves'];
const totals = ['dwell','active','added','deleted','linesAdded','linesDeleted','undo','redo',...eventCounters];
function count(changes) {return changes.reduce((a,c)=>({added:a.added+c.text.length,deleted:a.deleted+c.rangeLength,linesAdded:a.linesAdded+(c.text.match(/\n/g)||[]).length,linesDeleted:a.linesDeleted+c.range.end.line-c.range.start.line}),{added:0,deleted:0,linesAdded:0,linesDeleted:0});}
class Tracker {
 constructor(idle=300000){this.idle=idle;this.rows=[];this.current=null;this.last=null;this.activeAt=0;this.focus=false;}
 set(target,focus,t){this.tick(t);if(this.focus===focus&&this.target?.uri===target?.uri)return;this.current=null;this.target=target;this.focus=focus;this.last=t;this.activeAt=t;}
 activity(t){this.tick(t);if(this.focus)this.activeAt=t;}
 row(t,target=this.target){if(!target)return null; if(target===this.target && this.current && this.current.day===day(t))return this.current;
 if(target!==this.target){const existing=this.rows.findLast(r=>r.uri===target.uri&&r.dwell===0&&Math.floor(r.start/60000)===Math.floor(t/60000));if(existing)return existing;}
 const r={id:crypto.randomUUID(),day:day(t),...target,start:t,end:t,metricsVersion:2,...Object.fromEntries(totals.map(k=>[k,0]))};this.rows.push(r);if(target===this.target)this.current=r;return r;}
 tick(t){if(this.last===null){this.last=t;return;}const from=this.last;this.last=t;
 if(t<from){this.current=null;this.activeAt=t;return;}
 if(!this.focus||!this.target||t===from)return;
 if(t-from>30000){this.current=null;return;} // sleep / stalled host is never billed
 let cursor=from;
 while(cursor<t){const d=new Date(cursor);d.setHours(24,0,0,0);const end=Math.min(t,d.getTime());const r=this.row(cursor);r.dwell+=end-cursor;r.active+=Math.max(0,Math.min(end,this.activeAt+this.idle)-cursor);r.end=end;cursor=end;}
 }
 edit(target,changes,reason,t){this.tick(t);if(!changes.length)return;const r=this.row(t,this.target&&target.uri===this.target.uri?this.target:target);r.end=Math.max(r.end,t);const c=count(changes);for(const k of Object.keys(c))r[k]+=c[k];r.changeEvents++;if(reason===1)r.undo++;if(reason===2)r.redo++;}
 // Document changes can come from Git, formatters or extensions. Only editor
 // interaction extends activity; a content delta is never a keyboard event.
 interaction(kind,t){if(!this.focus||!this.target)return;this.activity(t);if(!['keyboardEvents','mouseEvents'].includes(kind))return;const r=this.row(t);r.end=Math.max(r.end,t);r[kind]++;}
 save(target,t){this.tick(t);const r=this.row(t,this.target&&target.uri===this.target.uri?this.target:target);if(r){r.end=Math.max(r.end,t);r.saves++;}}
}
function summaryCounters(){return {...Object.fromEntries(totals.map(k=>[k,0])),measuredRecords:0,legacyRecords:0};}
function addCounters(result,row){for(const k of totals)result[k]+=row[k]||0;result[row.metricsVersion===2?'measuredRecords':'legacyRecords']++;}
function summarize(rows,meta={}){
 const groups=new Map();
 for(const r of rows){
  const m=meta[r.project]||{},name=m.alias?.trim()||r.projectName;
  let g=groups.get(name);
  if(!g){g={project:r.project,projects:[],name,tasks:[],...summaryCounters(),files:[]};groups.set(name,g);}
  if(!g.projects.includes(r.project))g.projects.push(r.project);
  const task=m.task||'',type=m.type||'Task';
  if(!g.tasks.some(x=>x.task===task&&x.type===type))g.tasks.push({task,type});
  addCounters(g,r);
  let f=g.files.find(f=>f.uri===r.uri);
  if(!f){f={uri:r.uri,path:r.path,project:r.project,...summaryCounters()};g.files.push(f);}
  addCounters(f,r);
 }
 return [...groups.values()].map(g=>({...g,task:g.tasks.length===1?g.tasks[0].task:'',type:g.tasks.length===1?g.tasks[0].type:'',changedFiles:g.files.filter(f=>f.changeEvents||f.added||f.deleted).length}));
}
module.exports={Tracker,day,count,summarize,eventCounters};
