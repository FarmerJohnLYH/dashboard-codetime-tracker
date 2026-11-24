'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Tracker,day,summarize} = require('./core');
const {Storage,validDay} = require('./storage');
const {buildExport} = require('./export');
const {timeline,validThreshold}=require('./timeline');
const os=require('node:os');
let tracker,store,panel,status,timer,ctx,exporting;
let dirty=false,writing=null,viewDay,followToday=true,renderVersion=0,opening=null,lastError='';
let statusVersion=0,statusDay,statusTotal=0,statusWarnings=[];
function drawStatus(){
 if(!status)return;
 const minutes=Math.floor(statusTotal/60000);
 status.text=`$(code) ${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
 status.tooltip=['今天实际停留时间（所有项目，小时:分钟）','点击打开代码时间统计',...statusWarnings,lastError].filter(Boolean).join('\n');
}
async function refreshStatus(){
 const owner=status,source=store,current=tracker,date=day(Date.now()),version=++statusVersion;
 if(!owner)return;
 if(statusDay!==date){statusDay=date;statusTotal=0;statusWarnings=[];drawStatus();}
 try{
  const {rows,warnings}=await source.read(date);
  if(owner!==status||version!==statusVersion||date!==day(Date.now()))return;
  // Disk includes earlier sessions and other windows. Current in-memory rows
  // replace their saved checkpoints, so pending edits are not counted twice.
  const latest=new Map(rows.map(r=>[r.id,r]));
  for(const row of current.rows)if(row.day===date)latest.set(row.id,row);
  statusTotal=[...latest.values()].reduce((total,row)=>total+row.dwell,0);
  statusWarnings=warnings;drawStatus();
 }catch(error){if(owner===status&&version===statusVersion)report(error);}
}
function report(error) {
 if(!status)return;
 const message=error.message||String(error);
 if(message!==lastError){lastError=message;vscode.window.showErrorMessage('Dashboard: '+message);}
 drawStatus();
}
function target(doc) {
 if(!doc||!['file','vscode-remote'].includes(doc.uri.scheme))return null;
 const folder=vscode.workspace.getWorkspaceFolder(doc.uri);
 return {uri:doc.uri.toString(),path:doc.uri.fsPath,project:folder?folder.uri.toString():doc.uri.toString(),projectName:folder?folder.name:path.basename(doc.uri.fsPath)};
}
function currentTarget(){
 // An active Webview can leave activeTextEditor pointing at a visible split editor.
 if(panel?.active)return null;
 const tab=vscode.window.tabGroups?.activeTabGroup?.activeTab;
 if(tab && vscode.TabInputText && !(tab.input instanceof vscode.TabInputText))return null;
 return target(vscode.window.activeTextEditor?.document);
}
function change(){tracker.set(currentTarget(),vscode.window.state.focused,Date.now());dirty=true;}
function activity(event,selection=false){
 if(!vscode.window.state.focused || !tracker.target)return;
 if(event?.textEditor?.document.uri.toString()!==tracker.target.uri)return;
 if(selection){
  const kind=vscode.TextEditorSelectionChangeKind;
  if(event.kind!==kind.Keyboard&&event.kind!==kind.Mouse)return;
  tracker.interaction(event.kind===kind.Keyboard?'keyboardEvents':'mouseEvents',Date.now());
 }else tracker.activity(Date.now());
 dirty=true;
}
function flush(){
 if(writing)return writing;
 writing=(async()=>{
  // Coalesce ticks arriving during a slow write; never queue unbounded snapshots.
  while(dirty){dirty=false;const rows=tracker.rows.map(r=>({...r}));try{await store.save(rows);const cutoff=day(Date.now()-86400000),saved=new Map(rows.map(r=>[r.id,r]));const keepDays=new Set(tracker.rows.filter(r=>r===tracker.current||!saved.has(r.id)||Object.keys(r).some(k=>r[k]!==saved.get(r.id)[k])).map(r=>r.day));tracker.rows=tracker.rows.filter(r=>r.day>=cutoff||keepDays.has(r.day));}catch(e){dirty=true;report(e);return;}}
  if(lastError){lastError='';drawStatus();}
 })().finally(()=>{writing=null;});return writing;
}
async function render(){
 const owner=panel;if(!owner)return;
 const version=++renderVersion;
 if(followToday)viewDay=day(Date.now());const date=viewDay;
 await flush();const {rows:diskRows,warnings}=await store.read(date);const meta=await store.metadata();
 const latest=new Map(diskRows.map(r=>[r.id,r]));
 for(const row of tracker.rows)if(row.day===date)latest.set(row.id,{...row});
 const rows=[...latest.values()];
 if(lastError)warnings.push('记录尚未保存，将自动重试：'+lastError);
 if(owner!==panel||version!==renderVersion)return;
 await owner.webview.postMessage({type:'data',date,warnings,groups:summarize(rows,meta),timeline:timeline(rows,vscode.workspace.getConfiguration('dashboard').get('timelineMinMinutes',2)),rows:rows.map(r=>({...r,name:meta[r.project]?.alias||r.projectName}))});
}
async function editMeta(projects){
 const meta=await store.metadata(),m=meta[projects[0]]||{};
 const value=await vscode.window.showInputBox({title:'项目重命名',prompt:'修改当前合并组的全部项目显示名称；同名自动合并，完整路径及历史保留',value:m.alias||''});
 if(value===undefined)return;
 for(const project of projects)await store.patch(project,'alias',{alias:value.trim()});
 await render();
}
function exportRaw(){
 if(exporting)return exporting;
 exporting=(async()=>{
  const date=followToday?day(Date.now()):viewDay;
  const selection=await vscode.window.showQuickPick([
   {label:'当前日期',description:date,scope:'day'},
   {label:'全部历史',description:'导出所有可读取的日期及当前未保存记录',scope:'all'}
  ],{title:'导出统计原始数据',placeHolder:'JSON 格式，保留逐条记录及完整路径'});
  if(!selection)return;
  const destination=await vscode.window.showSaveDialog({title:'保存统计原始数据',defaultUri:vscode.Uri.file(path.join(os.homedir(),'dashboard-raw-'+(selection.scope==='day'?date:'all')+'.json')),filters:{JSON:['json']},saveLabel:'导出'});
  if(!destination)return;
  tracker.tick(Date.now());dirty=true;
  await flush();
  const payload=await buildExport(store,tracker.rows,{scope:selection.scope,date});
  await vscode.workspace.fs.writeFile(destination,Buffer.from(JSON.stringify(payload,null,2)+'\n','utf8'));
  const message=`已导出 ${payload.records.length} 条原始记录。`;
  if(payload.warnings.length)await vscode.window.showWarningMessage(message+' 部分损坏记录无法读取，详见 JSON 中的 warnings；原文件已保留。');
  else await vscode.window.showInformationMessage(message);
 })().catch(report).finally(()=>{exporting=null;});
 return exporting;
}
async function message(m){
 if(!m||typeof m!=='object')return;
 try{
  if(m.type==='ready')await render();
  else if(m.type==='export')await exportRaw();
  else if(m.type==='timelineThreshold'&&validThreshold(m.value)){
   const config=vscode.workspace.getConfiguration('dashboard');
   const target=config.inspect?.('timelineMinMinutes')?.workspaceValue!==undefined?vscode.ConfigurationTarget.Workspace:vscode.ConfigurationTarget.Global;
   await config.update('timelineMinMinutes',m.value,target);
   await render();
  }
  else if(m.type==='date'&&validDay(m.value)){viewDay=m.value;followToday=viewDay===day(Date.now());await render();}
  else if(m.type==='edit'&&m.field==='alias'&&typeof m.project==='string'){
   const {rows}=await store.read(viewDay),meta=await store.metadata();
   const live=tracker.rows.filter(r=>r.day===viewDay),latest=new Map([...rows,...live].map(r=>[r.id,r]));
   const group=summarize([...latest.values()],meta).find(g=>g.projects.includes(m.project));
   if(group)await editMeta(group.projects);
  }
 }catch(e){report(e);}
}
async function open(){
 if(panel){panel.reveal();return;}if(opening)return opening;
 opening=(async()=>{
  const template=await fs.readFile(path.join(ctx.extensionPath,'media','index.html'),'utf8');
  const owner=vscode.window.createWebviewPanel('dashboard','Dashboard',vscode.ViewColumn.Active,{enableScripts:true,localResourceRoots:[]});panel=owner;
  owner.onDidDispose(()=>{if(panel===owner){panel=null;++renderVersion;change();}});
  owner.onDidChangeViewState?.(()=>change());
  owner.webview.onDidReceiveMessage(message);
  owner.webview.html=template.replaceAll('__NONCE__',randomBytes(16).toString('hex'));
  change();
 })().finally(()=>opening=null);return opening;
}
function activate(context){
 ctx=context;exporting=null;dirty=false;writing=null;panel=null;opening=null;lastError='';renderVersion=0;
 viewDay=day(Date.now());followToday=true;
 store=new Storage(context.globalStorageUri.fsPath);
 tracker=new Tracker(vscode.workspace.getConfiguration('dashboard').get('idleMinutes',5)*60000);
 statusDay=day(Date.now());statusTotal=0;statusWarnings=[];
 status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,1);status.name='Dashboard 今日总时间';status.command='dashboard.open';drawStatus();status.show();
 context.subscriptions.push(status,vscode.commands.registerCommand('dashboard.open',()=>open().catch(report)),
 vscode.commands.registerCommand('dashboard.export',exportRaw),
 vscode.window.onDidChangeActiveTextEditor(change),vscode.window.onDidChangeWindowState(change),
 vscode.workspace.onDidChangeConfiguration(()=>{tracker.tick(Date.now());tracker.idle=vscode.workspace.getConfiguration('dashboard').get('idleMinutes',5)*60000;if(panel)render().catch(report);}),
 vscode.window.onDidChangeTextEditorSelection(e=>activity(e,true)),vscode.window.onDidChangeTextEditorVisibleRanges(e=>activity(e)),
 vscode.workspace.onDidSaveTextDocument(doc=>{const t=target(doc);if(t){tracker.save(t,Date.now());dirty=true;}}),
 vscode.workspace.onDidChangeTextDocument(e=>{const t=target(e.document);if(t&&e.contentChanges.length){tracker.edit(t,e.contentChanges,e.reason,Date.now());dirty=true;}}));
 if(vscode.window.tabGroups?.onDidChangeTabs)context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(change));
 change();timer=setInterval(()=>{tracker.tick(Date.now());dirty=true;flush();if(panel?.visible)render().catch(report);return refreshStatus();},10000);
 context.subscriptions.push({dispose:()=>clearInterval(timer)});
 return refreshStatus();
}
async function deactivate(){clearInterval(timer);++statusVersion;status=null;if(!tracker)return;tracker.tick(Date.now());dirty=true;await flush();}
module.exports={activate,deactivate};
