'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {supported,check}=require('../scripts/check-runtime.cjs');
test('Node 22.14 zstd/undici crash is diagnosed before UI dependencies load',()=>{
 for(const version of ['18.20.0','22.14.0','22.22.1','23.9.0','24.14.0','25.0.0'])assert.equal(supported(version),false,version);
 for(const version of ['22.22.2','22.23.0','24.15.0','24.18.1','26.0.0'])assert.equal(supported(version),true,version);
 assert.throws(()=>check('22.14.0',null),/zstd/);
 assert.throws(()=>check('24.18.1',null),/zstd/);
 assert.doesNotThrow(()=>check('24.18.1',()=>{}));
});

test('missing Playwright executable has an actionable diagnostic and custom Chrome is honored',()=>{
 const {browserOptions}=require('../scripts/browser-runtime.cjs');const chromium={executablePath:()=>'/missing/chromium'};
 assert.throws(()=>browserOptions(chromium,{},()=>false),/npx playwright install chromium/);
 assert.equal(browserOptions(chromium,{CHROMIUM_PATH:'/installed/chrome'},p=>p==='/installed/chrome').executablePath,'/installed/chrome');
 assert.equal(browserOptions(chromium,{},()=>true).executablePath,'/missing/chromium');
});

test('long Unix VS Code profile paths fail preflight instead of listen EINVAL',()=>{
 const {validateProfile}=require('../scripts/test-host.cjs');
 assert.doesNotThrow(()=>validateProfile('/tmp/dash-host-123','darwin'));
 assert.throws(()=>validateProfile('/workspace/'+('long-project-'.repeat(15)),'darwin'),/listen EINVAL/);
 assert.throws(()=>validateProfile('/tmp/'+('项目'.repeat(25)),'linux'),/listen EINVAL/);
 assert.doesNotThrow(()=>validateProfile('C:/'+('long-project-'.repeat(15)),'win32'));
});

test('browser sandbox EPERM failures are diagnosed without converting a failed run into a pass',async()=>{
 const {launchBrowser}=require('../scripts/browser-runtime.cjs');
 const denied=Object.assign(Error('Target closed; kill EPERM; signal=SIGABRT'),{code:'EPERM'});
 await assert.rejects(()=>launchBrowser({executablePath:()=>'/chrome',launch:async()=>{throw denied;}},{},()=>true),e=>e.cause===denied&&e.message.includes('不代表 UI 测试通过'));
 const other=Error('unexpected browser error');
 await assert.rejects(()=>launchBrowser({executablePath:()=>'/chrome',launch:async()=>{throw other;}},{},()=>true),e=>e===other);
 const browser={};assert.equal(await launchBrowser({executablePath:()=>'/chrome',launch:async()=>browser},{},()=>true),browser);
});
