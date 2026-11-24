'use strict';
const {chromium} = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const {summarize} = require('../src/core');

(async () => {
 const browser = await require('../scripts/browser-runtime.cjs').launchBrowser(chromium);
 try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, colorScheme: 'light'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const html = (await fs.readFile('media/index.html', 'utf8')).replaceAll('__NONCE__', 'testnonce');
  await page.setContent(html);
  // The OS theme may disagree with VS Code. Native date controls must follow
  // the webview's VS Code theme class, including high-contrast themes.
  for (const [theme, scheme] of [['vscode-dark', 'dark'], ['vscode-high-contrast', 'dark'],
   ['vscode-light', 'light'], ['vscode-high-contrast-light', 'light']]) {
   await page.emulateMedia({colorScheme: scheme === 'dark' ? 'light' : 'dark'});
   await page.evaluate(theme => { document.body.className = theme; }, theme);
   assert.equal(await page.locator('#date').evaluate(el => getComputedStyle(el).colorScheme), scheme);
  }
  const base = new Date(2026, 10, 24, 9).getTime();
  const r = {id: '1', project: 'file:///review/audio', projectName: 'audio', name: '音频处理引擎',
   uri: 'file:///review/audio/a.c', path: '/review/audio/src/a.c', start: base, end: base + 82 * 60000,
   dwell: 82 * 60000, active: 65 * 60000, added: 1240, deleted: 380, metricsVersion: 2, keyboardEvents: 840, mouseEvents: 12, saves: 18, changeEvents: 920, linesAdded: 48, linesDeleted: 10, undo: 4, redo: 2};
  const r2 = {...r, id: '2', project: 'file:///review/noise', name: '噪声过滤模块',
   path: '/review/noise/src/noise.c', start: base + 90 * 60000, end: base + 134 * 60000,
   dwell: 44 * 60000, active: 40 * 60000, added: 260, deleted: 90};
  const r3={...r,id:'3',project:'vscode-remote://ssh-remote+demo/other/audio',uri:'vscode-remote://ssh-remote+demo/other/audio/b.c',path:'/other/audio/b.c',start:base+150*60000,end:base+160*60000,dwell:10*60000,active:0,keyboardEvents:0,mouseEvents:0,saves:0,changeEvents:1,added:5000,deleted:2000};
  const meta = {[r.project]: {alias: r.name, task: 'DEMO-1234', type: 'SubTask'},
   [r2.project]: {alias: r2.name, task: 'DEMO-1234', type: 'SubTask'},[r3.project]:{alias:r.name,task:'DEMO-1234',type:'SubTask'}};
  await page.evaluate(d => window.postMessage(d, '*'), {type: 'data', date: '2026-11-24',
   rows: [r, r2, r3].map(r => ({...r, task: meta[r.project].task})), groups: summarize([r, r2, r3], meta)});
  await page.getByRole('button', {name: '展开文件'}).first().click();
  assert(await page.getByText(r.path, {exact: true}).isVisible());
  assert(await page.getByText('合并 2 个路径',{exact:true}).isVisible());
  assert(await page.getByText(r3.path,{exact:true}).isVisible());
  assert.equal(await page.getByText('填报工时', {exact: true}).count(), 0);
  assert.equal(await page.getByText('Jira任务', {exact: true}).count(), 0);
  assert(await page.getByRole('button',{name:'导出原始数据'}).isVisible());
  assert.equal(await page.getByText('键盘活动', {exact: true}).count(), 1);
  if(process.env.DASHBOARD_SCREENSHOTS){
   await fs.mkdir(process.env.DASHBOARD_SCREENSHOTS,{recursive:true});
   await page.evaluate(()=>{document.body.className='vscode-dark';});
   await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/table-dark.png',fullPage:true});
  }
  await page.getByRole('button', {name: '时间线', exact: true}).click();
  await page.getByRole('button', {name: '展开文件'}).first().click();
  assert(await page.getByText(r.path, {exact: false}).isVisible());
  await page.setViewportSize({width: 412, height: 800});
  for (const tab of ['时间线', '表格']) {
   await page.getByRole('button', {name: tab, exact: true}).click();
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   if(process.env.DASHBOARD_SCREENSHOTS)await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/narrow-'+(tab==='表格'?'table':'timeline')+'.png',fullPage:true});
  }
  await page.evaluate(() => window.postMessage({type: 'data', date: '2026-11-25', groups: [], rows: []}, '*'));
  await page.getByText('当天暂无记录', {exact: false}).waitFor();
  assert.deepEqual(errors, []);
  console.log('UI PASS: table, timeline, separate workload metrics, full path, 412px layout, empty state, four native-control themes, no script/CSP errors');
 } finally {
  await browser.close();
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
