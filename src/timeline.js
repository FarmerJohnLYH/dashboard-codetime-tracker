'use strict';
const HALF_HOUR=30*60000;
function validThreshold(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1440;}
function timeline(rows,minMinutes=2){
 const threshold=validThreshold(minMinutes)?minMinutes:2,buckets=new Map();let hidden=0,visible=0;
 rows.forEach((row,index)=>{
  if(row.dwell<threshold*60000){hidden++;return;}
  if(!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.end<row.start)return;
  const first=new Date(row.start);
  if(!Number.isFinite(first.getTime()))return;
  // Bound each record to its local day, including 23/25-hour DST days.
  const nextDay=new Date(first);nextDay.setHours(24,0,0,0);
  const end=Math.min(row.end,nextDay.getTime());
  // Subtract local minute/second offsets rather than setMinutes: this preserves
  // which occurrence of a repeated hour the event belongs to at DST fall-back.
  let slot=row.start-(first.getMinutes()%30)*60000-first.getSeconds()*1000-first.getMilliseconds();
  visible++;
  do{
   if(!buckets.has(slot))buckets.set(slot,{start:slot,items:[]});
   const segmentStart=Math.max(row.start,slot),segmentEnd=Math.min(end,slot+HALF_HOUR);
   buckets.get(slot).items.push({index,start:segmentStart,end:segmentEnd,continued:row.start<slot,continues:end>slot+HALF_HOUR});
   slot+=HALF_HOUR;
  }while(slot<end);
 });
 const result=[...buckets.values()].sort((a,b)=>a.start-b.start);
 for(const bucket of result)bucket.items.sort((a,b)=>a.start-b.start||a.index-b.index);
 return {minMinutes:threshold,hidden,visible,buckets:result};
}
module.exports={timeline,validThreshold};
