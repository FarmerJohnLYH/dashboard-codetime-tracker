'use strict';
const HALF_HOUR=30*60000;
function validThreshold(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1440;}
function timeline(rows,minMinutes=2,meta={}){
 const threshold=validThreshold(minMinutes)?minMinutes:2,buckets=new Map();let hidden=0,visible=0;
 rows.forEach((row,index)=>{
  if(!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.end<row.start||!Number.isFinite(row.dwell)||row.dwell<0)return;
  const first=new Date(row.start);
  if(!Number.isFinite(first.getTime()))return;
  const nextDay=new Date(first);nextDay.setHours(24,0,0,0);
  const end=Math.min(row.end,nextDay.getTime());
  // Preserve both occurrences of repeated local hours at DST fall-back.
  let slot=row.start-(first.getMinutes()%30)*60000-first.getSeconds()*1000-first.getMilliseconds();
  const name=meta[row.project]?.alias?.trim()||row.projectName||row.project||'未命名项目';
  do{
   if(!buckets.has(slot))buckets.set(slot,{start:slot,projects:new Map()});
   const projects=buckets.get(slot).projects,segmentStart=Math.max(row.start,slot),segmentEnd=Math.min(end,slot+HALF_HOUR);
   // Raw records have cumulative timing, not per-tick timing. Allocate across
   // slots by overlap; never repeat the full record's duration in each card.
   const fraction=end===row.start?1:(segmentEnd-segmentStart)/(end-row.start);
   const dwell=row.dwell*fraction,active=(row.active||0)*fraction;
   if(!projects.has(name))projects.set(name,{name,start:segmentStart,end:segmentEnd,dwell:0,active:0,files:[],indices:[]});
   const project=projects.get(name);project.start=Math.min(project.start,segmentStart);project.end=Math.max(project.end,segmentEnd);project.dwell+=dwell;project.active+=active;project.indices.push(index);
   let file=project.files.find(f=>f.uri===row.uri&&f.project===row.project);
   if(!file){file={uri:row.uri,project:row.project,path:row.path,dwell:0,active:0};project.files.push(file);}
   file.dwell+=dwell;file.active+=active;
   slot+=HALF_HOUR;
  }while(slot<end);
 });
 const result=[];
 for(const bucket of [...buckets.values()].sort((a,b)=>a.start-b.start)){
  const items=[...bucket.projects.values()].filter(p=>{if(p.dwell+1e-7<threshold*60000){hidden++;return false;}visible++;return true;}).sort((a,b)=>a.start-b.start||a.name.localeCompare(b.name));
  if(items.length)result.push({start:bucket.start,items});
 }
 return {minMinutes:threshold,hidden,visible,buckets:result};
}
module.exports={timeline,validThreshold};
