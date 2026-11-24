'use strict';
const {chromium} = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const {summarize} = require('../src/core');
const {timeline} = require('../src/timeline');

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
   timeline:timeline([r,r2,r3],meta), rows: [r, r2, r3].map(r => ({...r, task: meta[r.project].task})), groups: summarize([r, r2, r3], meta)});
  await page.getByRole('button', {name: '展开文件'}).first().click();
  assert(await page.getByText(r.path, {exact: true}).isVisible());
  assert.equal(await page.getByText('合并 2 个路径',{exact:true}).count(),0);
  assert(await page.getByText(r3.path,{exact:true}).isVisible());
  assert.equal(await page.getByText('填报工时', {exact: true}).count(), 0);
  assert.equal(await page.getByText('Jira任务', {exact: true}).count(), 0);
  assert(await page.getByRole('button',{name:'导出',exact:true}).isVisible());
  assert.equal(await page.getByText('键盘活动', {exact: true}).count(), 1);
  if(process.env.DASHBOARD_SCREENSHOTS){
   await fs.mkdir(process.env.DASHBOARD_SCREENSHOTS,{recursive:true});
   await page.evaluate(()=>{document.body.className='vscode-dark';});
   await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/table-dark.png',fullPage:true});
  }
  await page.getByRole('button', {name: '时间线', exact: true}).click();
  await page.getByRole('button', {name: /^展开项目/}).first().click();
  assert(await page.locator('.event-detail .path').getByText(r.path, {exact:true}).isVisible());
  await page.setViewportSize({width: 412, height: 800});
  for (const tab of ['时间线', '表格']) {
   await page.getByRole('button', {name: tab, exact: true}).click();
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
   if(process.env.DASHBOARD_SCREENSHOTS)await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/narrow-'+(tab==='表格'?'table':'timeline')+'.png',fullPage:true});
  }

  // Measure actual rendered geometry: cards are equally sized and no more than
  // four columns fit on desktop, regardless of event count or title length.
  await page.setViewportSize({width:1440,height:1050});
  await page.evaluate(()=>{document.body.className='vscode-dark';});
  const dense=Array.from({length:6},(_,i)=>({...r,id:'dense-'+i,project:'project-'+i,projectName:['audio-engine','Tools','名称特别长的音频处理项目用于验证省略不会撑开卡片','device-driver','dashboard','build-tools'][i],path:'/review/audio/src/file-'+i+'.c',uri:'file:///review/audio/src/file-'+i+'.c',start:base+i*4*60000,end:base+(i*4+3)*60000,dwell:3*60000,active:2*60000,keyboardEvents:90+i*20,saves:i+1}));
  dense.push({...r,id:'cross',projectName:'audio-engine',start:base+29*60000,end:base+70*60000,dwell:41*60000,active:32*60000});
  dense.push({...r,id:'short',project:'short',projectName:'短事件',start:base+27*60000,end:base+28*60000,dwell:60000,active:30000});
  dense.push({...r2,id:'tools',projectName:'Tools',start:base+75*60000,end:base+88*60000,dwell:13*60000,active:9*60000});
  dense.push({...r3,id:'device',projectName:'device-driver',start:base+95*60000,end:base+125*60000,dwell:30*60000,active:24*60000});
  const denseData={type:'data',date:'2026-11-24',rows:dense,groups:summarize(dense),timeline:timeline(dense)};
  await page.evaluate(d=>window.postMessage(d,'*'),denseData);
  await page.getByRole('button',{name:'时间线',exact:true}).click();
  const strip=page.locator('.event-strip').first();
  await strip.locator('.event-card').first().waitFor();
  const geometry=await strip.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,cards:[...el.children].map(c=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,left:c.getBoundingClientRect().left})),left:el.getBoundingClientRect().left}));
  assert.equal(geometry.cards.length,8);assert(geometry.scrollWidth>geometry.width);
  assert(geometry.cards.every(c=>Math.abs(c.width-geometry.cards[0].width)<1&&c.height===132));
  assert(geometry.cards[3].left+geometry.cards[3].width<=geometry.left+geometry.width+1);
  assert(geometry.cards[4].left>=geometry.left+geometry.width);
  assert.equal(await page.locator('.event-card').filter({hasText:'短事件'}).count(),1);
  const heights=await page.locator('.event-card').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert(heights.every(h=>h===132));
  if(process.env.DASHBOARD_SCREENSHOTS){await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/timeline-B-desktop.png',fullPage:true});await page.getByRole('button',{name:'表格',exact:true}).click();await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/table-minimal.png',fullPage:true});await page.getByRole('button',{name:'时间线',exact:true}).click();}
  await page.getByRole('button',{name:'向右查看项目',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('.event-strip').scrollLeft>100);
  // A refresh must not jump back to the first four cards.
  await strip.evaluate(el=>new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);el.removeEventListener('scroll',schedule);resolve();};const schedule=()=>{clearTimeout(timer);timer=setTimeout(done,150);};el.addEventListener('scroll',schedule);schedule();}));
  const offset=await strip.evaluate(el=>el.scrollLeft);
  await page.evaluate(d=>window.postMessage(d,'*'),denseData);
  await page.waitForFunction(expected=>Math.abs(document.querySelector('.event-strip').scrollLeft-expected)<2,offset);
  await strip.locator('button.event-card').last().click();assert(await page.locator('.event-detail').isVisible());
  assert.equal(await strip.locator('.event-card').last().evaluate(el=>el.getBoundingClientRect().height),132);
  await page.getByRole('button',{name:'收起项目详情'}).click();assert.equal(await page.locator('.event-detail').count(),0);
  assert(await page.locator('button.event-card:focus').count());
  assert.equal(await page.locator('#minMinutes').count(),0);
  const idle=page.locator('.idle-card').first();assert(await idle.count());
  const projectColor=await page.locator('button.event-card').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  const idleColor=await idle.evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(projectColor,idleColor);
  for(const count of [1,2,3,4]){
   const rows=dense.slice(0,count).map(r=>({...r,dwell:30*60000/count}));
   await page.evaluate(d=>window.postMessage(d,'*'),{type:'data',date:'2026-11-24',rows,groups:summarize(rows),timeline:timeline(rows)});
   await page.waitForFunction(n=>document.querySelectorAll('.event-card').length===n,count);
   const size=await page.locator('.event-strip').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,widths:[...el.children].map(c=>c.getBoundingClientRect().width)}));
   assert(size.scroll<=size.width+1);assert(size.widths.every(w=>Math.abs(w-size.widths[0])<1));
  }
  await page.evaluate(d=>window.postMessage(d,'*'),denseData);
  const expanded=page.locator('.event-card[aria-expanded="true"]');if(await expanded.count())await expanded.first().click();
  await strip.evaluate(el=>{el.scrollLeft=0;});
  await page.setViewportSize({width:412,height:850});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const narrow=await strip.evaluate(el=>({width:el.clientWidth,card:el.children[0].getBoundingClientRect().width}));assert(Math.abs(narrow.width-narrow.card)<1);
  if(process.env.DASHBOARD_SCREENSHOTS)await page.screenshot({path:process.env.DASHBOARD_SCREENSHOTS+'/timeline-B-narrow.png',fullPage:true});
  await page.evaluate(() => window.postMessage({type: 'data', date: '2026-11-25', groups: [], rows: []}, '*'));
  await page.getByText('当天暂无记录', {exact: false}).waitFor();
  assert.deepEqual(errors, []);
  console.log('UI PASS: half-hour B timeline, 1/2/3/4 equal columns, overflow scrolling, fixed 132px cards, idle cards, all short projects, scroll restoration, details, table/export, 412px layout, four themes, no CSP errors');
 } finally {
  await browser.close();
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
