'use strict';
const {chromium} = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const {summarize} = require('../src/core');

(async () => {
 const browser = await chromium.launch({headless: true,
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
  args: ['--no-sandbox']});
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
   dwell: 82 * 60000, active: 65 * 60000, added: 1240, deleted: 380};
  const r2 = {...r, id: '2', project: 'file:///review/noise', name: '噪声过滤模块',
   path: '/review/noise/src/noise.c', start: base + 90 * 60000, end: base + 134 * 60000,
   dwell: 44 * 60000, active: 40 * 60000, added: 260, deleted: 90};
  const meta = {[r.project]: {alias: r.name, task: 'DEMO-1234', type: 'SubTask'},
   [r2.project]: {alias: r2.name, task: 'DEMO-1234', type: 'SubTask'}};
  await page.evaluate(d => window.postMessage(d, '*'), {type: 'data', date: '2026-11-24',
   rows: [r, r2].map(r => ({...r, task: meta[r.project].task})), groups: summarize([r, r2], meta)});
  await page.getByRole('button', {name: '展开文件'}).first().click();
  assert(await page.getByText(r.path, {exact: true}).isVisible());
  assert.equal(await page.getByText('2h *', {exact: true}).count(), 1);
  await page.getByRole('button', {name: '时间线', exact: true}).click();
  await page.getByRole('button', {name: '展开文件'}).first().click();
  assert(await page.getByText(r.path, {exact: false}).isVisible());
  await page.setViewportSize({width: 412, height: 800});
  for (const tab of ['时间线', '表格']) {
   await page.getByRole('button', {name: tab, exact: true}).click();
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.evaluate(() => window.postMessage({type: 'data', date: '2026-11-25', groups: [], rows: []}, '*'));
  await page.getByText('当天暂无记录', {exact: false}).waitFor();
  assert.deepEqual(errors, []);
  console.log('UI PASS: table, timeline, shared task, full path, 412px layout, empty state, four native-control themes, no script/CSP errors');
 } finally {
  await browser.close();
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
