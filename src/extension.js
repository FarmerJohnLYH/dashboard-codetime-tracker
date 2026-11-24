'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Tracker,day,summarize} = require('./core');
const {Storage,validDay} = require('./storage');
let tracker,store,panel,status,timer,ctx;
let dirty=false,writing=null,viewDay,followToday=true,renderVersion=0,opening=null,lastError='';
function report(error) {
 const message=error.message||String(error);
 status.text='$(warning) Dashboard';
 if(message!==lastError){lastError=message;vscode.window.showErrorMessage('Dashboard: '+message);}
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
function activity(event){
 if(!vscode.window.state.focused || !tracker.target)return;
 if(event?.textEditor?.document.uri.toString()!==tracker.target.uri)return;
 tracker.activity(Date.now());dirty=true;
}
function flush(){
 if(writing)return writing;
 writing=(async()=>{
  // Coalesce ticks arriving during a slow write; never queue unbounded snapshots.
  while(dirty){dirty=false;const rows=tracker.rows.map(r=>({...r}));try{await store.save(rows);const cutoff=day(Date.now()-86400000),saved=new Map(rows.map(r=>[r.id,r]));const keepDays=new Set(tracker.rows.filter(r=>r===tracker.current||!saved.has(r.id)||Object.keys(r).some(k=>r[k]!==saved.get(r.id)[k])).map(r=>r.day));tracker.rows=tracker.rows.filter(r=>r.day>=cutoff||keepDays.has(r.day));}catch(e){dirty=true;report(e);return;}}
  if(lastError){lastError='';status.text='$(clock) Dashboard';}
 })().finally(()=>{writing=null;});return writing;
}
async function render(){
 const owner=panel;if(!owner)return;
 const version=++renderVersion;
 if(followToday)viewDay=day(Date.now());const date=viewDay;
 await flush();const {rows,warnings}=await store.read(date);const meta=await store.metadata();
 if(owner!==panel||version!==renderVersion)return;
 await owner.webview.postMessage({type:'data',date,warnings,groups:summarize(rows,meta),rows:rows.map(r=>({...r,name:meta[r.project]?.alias||r.projectName,task:meta[r.project]?.task||''}))});
}
async function editMeta(project,field){
 const meta=await store.metadata(),m=meta[project]||{};let value;
 if(field==='alias'){
  const v=await vscode.window.showInputBox({title:'项目重命名',prompt:'仅修改显示名称，完整路径及历史保留',value:m.alias||''});
  if(v===undefined)return;value={alias:v.trim()};
 }else{
  const v=await vscode.window.showInputBox({title:'Jira 任务',prompt:'只填写 Task / SubTask；有子任务时填写子任务。留空取消关联。',value:m.task||'',validateInput:v=>!v.trim()||/^[A-Z][A-Z0-9_]*-\d+$/.test(v.trim())?null:'请输入任务号，例如 DEMO-1234'});
  if(v===undefined)return;const task=v.trim();if(task&&!/^[A-Z][A-Z0-9_]*-\d+$/.test(task))return;
  const type=task?await vscode.window.showQuickPick(['SubTask','Task'],{title:'选择任务类型（手工确认）'}):'Task';
  if(!type)return;value={task,type};
 }
 await store.patch(project,field,value);await render();
}
async function message(m){
 if(!m||typeof m!=='object')return;
 try{
  if(m.type==='ready')await render();
  else if(m.type==='date'&&validDay(m.value)){viewDay=m.value;followToday=viewDay===day(Date.now());await render();}
  else if(m.type==='edit'&&['alias','task'].includes(m.field)&&typeof m.project==='string'){
   const {rows}=await store.read(viewDay);if(rows.some(r=>r.project===m.project))await editMeta(m.project,m.field);
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
 ctx=context;dirty=false;writing=null;panel=null;opening=null;lastError='';renderVersion=0;
 viewDay=day(Date.now());followToday=true;
 store=new Storage(context.globalStorageUri.fsPath);
 tracker=new Tracker(vscode.workspace.getConfiguration('dashboard').get('idleMinutes',5)*60000);
 status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,1);status.text='$(clock) Dashboard';status.tooltip='打开代码时间统计';status.command='dashboard.open';status.show();
 context.subscriptions.push(status,vscode.commands.registerCommand('dashboard.open',()=>open().catch(report)),
 vscode.window.onDidChangeActiveTextEditor(change),vscode.window.onDidChangeWindowState(change),
 vscode.workspace.onDidChangeConfiguration(()=>{tracker.tick(Date.now());tracker.idle=vscode.workspace.getConfiguration('dashboard').get('idleMinutes',5)*60000;}),
 vscode.window.onDidChangeTextEditorSelection(activity),vscode.window.onDidChangeTextEditorVisibleRanges(activity),
 vscode.workspace.onDidChangeTextDocument(e=>{const t=target(e.document);if(t&&e.contentChanges.length){tracker.edit(t,e.contentChanges,e.reason,Date.now());dirty=true;}}));
 if(vscode.window.tabGroups?.onDidChangeTabs)context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(change));
 change();timer=setInterval(()=>{tracker.tick(Date.now());dirty=true;flush();if(panel?.visible)render().catch(report);},10000);
 context.subscriptions.push({dispose:()=>clearInterval(timer)});
}
async function deactivate(){clearInterval(timer);if(!tracker)return;tracker.tick(Date.now());dirty=true;await flush();}
module.exports={activate,deactivate};
