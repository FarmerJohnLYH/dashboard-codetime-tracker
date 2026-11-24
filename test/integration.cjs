'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Storage} = require('../src/storage');
const {day} = require('../src/core');

// Run with --extensionTestsPath and an isolated --user-data-dir. Pass that same
// directory in DASHBOARD_TEST_USER_DATA_DIR; never read the user's normal data.
exports.run = async () => {
 const profile = process.env.DASHBOARD_TEST_USER_DATA_DIR;
 assert(profile, 'Set DASHBOARD_TEST_USER_DATA_DIR to the isolated --user-data-dir');
 const output = process.env.DASHBOARD_TEST_OUTPUT || path.join(profile, 'integration-result.json');
 const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-fixture-'));
 const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
 const checks = [];
 try {
  const manifest = require('../package.json');
  const ext = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert(ext, 'Dashboard must be installed or supplied via --extensionDevelopmentPath');
  await ext.activate();
  const uri = vscode.Uri.file(path.join(fixture, 'a.c'));
  await fs.writeFile(uri.fsPath, 'int a;\n');
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  await editor.edit(b => b.insert(new vscode.Position(0, 0), 'TRANSIENT'));
  await editor.edit(b => b.delete(new vscode.Range(0, 0, 0, 9)));
  assert(doc.isDirty, 'Unsaved edits must be observable');
  const focusedAtStart = vscode.window.state.focused;
  let focusLost = !focusedAtStart;
  const focus = vscode.window.onDidChangeWindowState(s => { if (!s.focused) focusLost = true; });
  await pause(1800);
  await vscode.commands.executeCommand('dashboard.open');
  const store = new Storage(path.join(profile, 'User/globalStorage', ext.id));
  let rows = [];
  for (let i = 0; i < 100; i++) {
   rows = (await store.read(day(Date.now()))).rows.filter(r => r.uri === uri.toString());
   if (rows.some(r => r.added >= 9 && r.deleted >= 9)) break;
   await pause(100);
  }
  assert(rows.some(r => r.added >= 9 && r.deleted >= 9), 'Transient edits must persist');
  checks.push('unsaved insert/delete persisted');
  const dwell = rows.reduce((sum, r) => sum + r.dwell, 0);
  await pause(11000);
  const after = (await store.read(day(Date.now()))).rows.filter(r => r.uri === uri.toString());
  focus.dispose();
  const skipped = [];
  // VS Code's focus flag alone does not prove the OS desktop is unlocked.
  if (process.env.DASHBOARD_TEST_UNLOCKED === '1' && !focusLost) {
   assert(dwell >= 1000, 'Foreground editor dwell must increase');
   assert.equal(after.reduce((sum, r) => sum + r.dwell, 0), dwell, 'Dashboard must stop editor time');
   checks.push('foreground dwell advances', 'Dashboard excludes report-viewing time');
  } else {
   skipped.push('foreground timing: unlock the desktop and keep the test window focused');
  }
  await fs.writeFile(output, JSON.stringify({passed: true, complete: !skipped.length, checks, skipped, vscode: vscode.version, rows: after}, null, 2));
 } catch (error) {
  await fs.writeFile(output, JSON.stringify({passed: false, checks, error: error.stack}, null, 2));
  throw error;
 } finally {
  await fs.rm(fixture, {recursive: true, force: true});
 }
};
