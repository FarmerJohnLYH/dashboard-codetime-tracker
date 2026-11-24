'use strict';
const {validDay}=require('./storage');
async function buildExport(store,liveRows,{scope,date,now=Date.now()}){
 if(!['day','all'].includes(scope)||scope==='day'&&!validDay(date))throw Error('Invalid export scope');
 const snapshot=liveRows.map(row=>({...row}));
 const dates=scope==='day'?[date]:[...new Set([...(await store.dates()),...snapshot.map(r=>r.day)])].sort();
 const records=new Map(),warnings=[];
 for(const date of dates){
  const result=await store.read(date);
  for(const row of result.rows)records.set(row.day+'\0'+row.id,row);
  warnings.push(...result.warnings.map(message=>({date,message})));
 }
 for(const row of snapshot)if(dates.includes(row.day))records.set(row.day+'\0'+row.id,row);
 const metadata=await store.metadata();
 const projectIds=new Set([...records.values()].map(r=>r.project));
 const projects=scope==='all'?metadata:Object.fromEntries(Object.entries(metadata).filter(([id])=>projectIds.has(id)));
 return {
  schemaVersion:1,exportedAt:new Date(now).toISOString(),scope:{kind:scope,dates},
  units:{start:'unix milliseconds',end:'unix milliseconds',dwell:'milliseconds',active:'milliseconds',added:'UTF-16 code units',deleted:'UTF-16 code units',linesAdded:'line breaks',linesDeleted:'line breaks',keyboardEvents:'VS Code Keyboard selection events',mouseEvents:'VS Code Mouse selection events',changeEvents:'document change events',saves:'document save events',undo:'undo change events',redo:'redo change events'},
  projects,
  records:[...records.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start||a.id.localeCompare(b.id)),
  warnings
 };
}
module.exports={buildExport};
