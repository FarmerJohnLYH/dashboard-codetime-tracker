'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const validDay = value => {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
const counters = ['dwell','active','added','deleted','linesAdded','linesDeleted','undo','redo'];
function validRow(r, date) {
 return r && typeof r.id === 'string' && r.day === date && ['uri','path','project','projectName'].every(k=>typeof r[k]==='string') && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end>=r.start && counters.every(k=>Number.isFinite(r[k])&&r[k]>=0) && r.active<=r.dwell;
}
class Storage {
 constructor(root, session=randomUUID(), io=fs) { this.root=root;this.session=session;this.io=io; }
 async atomic(file,value) {
  await this.io.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';
  try { await this.io.writeFile(tmp,JSON.stringify(value),'utf8');await this.io.rename(tmp,file); }
  finally { await this.io.unlink(tmp).catch(()=>{}); }
 }
 async save(rows) {
  const groups=new Map();for(const r of rows){if(!validDay(r.day)||!validRow(r,r.day))throw Error('Invalid tracking record');if(!groups.has(r.day))groups.set(r.day,[]);groups.get(r.day).push(r);}
  for(const [date,items] of groups)await this.atomic(path.join(this.root,'records',date,this.session+'.json'),items);
 }
 async json(file,fallback) {try{return JSON.parse(await this.io.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async list(dir) {try{return await this.io.readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 async read(date) {
  if(!validDay(date))throw Error('Invalid date');const rows=[],warnings=[];const dir=path.join(this.root,'records',date);
  for(const file of (await this.list(dir)).filter(n=>n.endsWith('.json')).sort()){
   try {const data=await this.json(path.join(dir,file),[]);if(!Array.isArray(data)||data.some(r=>!validRow(r,date)))throw Error('Invalid records');rows.push(...data);}
   catch {warnings.push('部分记录无法读取，原文件已保留。');}
  }
  return {rows,warnings:[...new Set(warnings)]};
 }
 async metadata() {
  const legacy=await this.json(path.join(this.root,'projects.json'),{});
  if(!legacy||Array.isArray(legacy)||typeof legacy!=='object')throw Error('项目配置损坏，已保留原文件');
  const result={...legacy};const dir=path.join(this.root,'project-fields');
  for(const name of (await this.list(dir)).filter(n=>n.endsWith('.json')).sort()){
   const v=await this.json(path.join(dir,name),null);
   if(!v||typeof v.project!=='string'||!['alias','task'].includes(v.field))throw Error('项目配置损坏，已保留原文件');
   result[v.project]={...(result[v.project]||{}),...v.value};
  }return result;
 }
 async patch(project,field,value) {
  // Separate fields avoid unrelated project/alias/task writes overwriting one another.
  if(typeof project!=='string'||!['alias','task'].includes(field))throw Error('Invalid project field');
  const id=createHash('sha256').update(project).digest('hex');
  await this.atomic(path.join(this.root,'project-fields',id+'.'+field+'.json'),{project,field,value});
 }
}
module.exports={Storage,validDay,validRow};
