const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {JSDOM}=require('jsdom');const {summarize}=require('../src/core');const {timeline}=require('../src/timeline');
test('real page script supports table/timeline, rename messages, dates and escaping',async()=>{const messages=[];const dom=new JSDOM(fs.readFileSync('media/index.html','utf8'),{runScripts:'dangerously',beforeParse(w){w.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m),getState:()=>null,setState(){}})}});const w=dom.window,d=w.document;const r={id:'1',project:'file:///a',projectName:'<img src=x onerror=alert(1)>',name:'Audio',path:'F:\\audio\\a.c',uri:'file:///a/a.c',start:Date.now(),end:Date.now()+10000,dwell:10000,active:10000,added:5,deleted:5};w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-24',rows:[r],timeline:timeline([r],0),groups:summarize([r],{})}}));assert(d.querySelector('table'));assert.equal(d.querySelector('img'),null);d.querySelector('[data-expand]').click();assert(d.body.textContent.includes(r.path));d.querySelector('[data-alias]').click();assert.equal(messages.at(-1).field,'alias');assert.equal(d.querySelector('[data-task]'),null);d.getElementById('export').click();assert.equal(messages.at(-1).type,'export');d.getElementById('timelineTab').click();assert(d.querySelector('.timeline'));assert.equal(d.querySelector('table'),null);d.querySelector('[data-event]').click();assert(d.body.textContent.includes(r.path));d.getElementById('prev').click();assert.equal(messages.at(-1).value,'2026-11-23');w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-25',rows:[],groups:[]}}));assert(d.body.textContent.includes('当天暂无记录'));for(const label of ['暂停','补录','复制填报清单'])assert(!d.body.textContent.includes(label));dom.window.close();});
test('corrupt restored state falls back and warnings render as text',()=>{const dom=new JSDOM(fs.readFileSync('media/index.html','utf8'),{runScripts:'dangerously',beforeParse(w){w.acquireVsCodeApi=()=>({postMessage(){},getState:()=>({view:'bad',expanded:'bad'}),setState(){}})}});const w=dom.window;w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-24',rows:[],groups:[],warnings:['<script>bad</script>']}}));assert(w.document.getElementById('tableTab').classList.contains('selected'));assert.equal(w.document.getElementById('warnings').textContent,'<script>bad</script>');assert.equal(w.document.getElementById('warnings').children.length,0);dom.window.close();});

test('merged groups expose workload and legacy unknowns without Jira or worklog columns',()=>{
 const dom=new JSDOM(fs.readFileSync('media/index.html','utf8'),{runScripts:'dangerously'}),w=dom.window,d=w.document;
 const rows=['a','b'].map((project,i)=>({id:project,project,projectName:'same',uri:project,path:'/full/'+project,start:0,end:1000,dwell:1000,active:500,added:3,deleted:1}));
 const send=()=>w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-24',rows,timeline:timeline(rows,0),groups:summarize(rows,{a:{task:'ABC-1'}})}}));send();
 assert.equal(d.querySelectorAll('tbody > tr').length,1);assert(d.body.textContent.includes('合并 2 个路径'));
 assert.equal(d.querySelector('[data-task]'),null);assert(!d.getElementById('content').textContent.includes('ABC-1'));assert(!d.getElementById('content').textContent.includes('Jira'));assert(!d.getElementById('content').textContent.includes('未分配'));
 assert(!d.body.textContent.includes('填报工时'));assert(!d.body.textContent.includes('累计增删'));
 assert(d.body.textContent.includes('— 次'));assert(d.body.textContent.includes('非物理按键总数'));
 Object.assign(rows[0],{metricsVersion:2,keyboardEvents:4,saves:1,changeEvents:2});send();
 assert(d.body.textContent.includes('4 * 次'));
 d.querySelector('[data-expand]').click();assert(d.body.textContent.includes('/full/a'));assert(d.body.textContent.includes('/full/b'));
 d.getElementById('timelineTab').click();d.querySelector('[data-event]').click();assert(d.body.textContent.includes('键盘活动 4 次'));
 dom.window.close();
});

test('B timeline renders half-hour stamps, continuation cards, fixed card classes and threshold messages',()=>{
 const messages=[],dom=new JSDOM(fs.readFileSync('media/index.html','utf8'),{runScripts:'dangerously',beforeParse(w){w.acquireVsCodeApi=()=>({postMessage:m=>messages.push(m),getState:()=>({view:'timeline'}),setState(){}});}}),w=dom.window,d=w.document;
 const base=new Date(2026,10,24,9).getTime(),rows=Array.from({length:6},(_,i)=>({id:String(i),project:'p',name:'Project <script>',projectName:'p',path:'/a/'+i+'.c',start:base+i*60000,end:base+(i+3)*60000,dwell:180000,active:60000,added:1,deleted:0}));
 rows.push({...rows[0],id:'cross',start:base+29*60000,end:base+31*60000,dwell:120000});
 w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-24',rows,groups:summarize(rows),timeline:timeline(rows)}}));
 assert.deepEqual([...d.querySelectorAll('.bucket-time')].map(el=>el.textContent),['09:00','09:30']);
 assert.equal(d.querySelectorAll('.bucket')[0].querySelectorAll('.event-card').length,7);assert(d.querySelector('.event-strip').classList.contains('cards-4'));
 assert(d.getElementById('content').textContent.includes('接续上一时段'));assert.equal(d.querySelectorAll('#content script').length,0);
 d.querySelector('[data-event]').click();assert(d.querySelector('.event-detail'));assert.equal(d.querySelectorAll('.event-card').length,8);
 d.getElementById('minMinutes').value='0.5';d.getElementById('applyMin').click();assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))),{type:'timelineThreshold',value:.5});
 const before=messages.length;d.getElementById('minMinutes').value='-1';d.getElementById('applyMin').click();assert.equal(messages.length,before);
 w.dispatchEvent(new w.MessageEvent('message',{data:{type:'data',date:'2026-11-24',rows,groups:summarize(rows),timeline:timeline(rows,10)}}));assert(d.body.textContent.includes('当前阈值下暂无事件'));assert(d.getElementById('minMinutes'));dom.window.close();
});
