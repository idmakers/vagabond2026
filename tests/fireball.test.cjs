const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const C=require('../core.js');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sandbox={window:{}};vm.runInNewContext(read('fireball2026/data/festival.js'),sandbox);
const config=C.validateConfig(JSON.parse(JSON.stringify(sandbox.window.FESTIVAL_CONFIG)));

test('Fireball official transcription contains 27 slots each day and distinct special programming',()=>{
  assert.equal(config.events.length,54);assert.equal(config.stages.length,5);
  assert.deepEqual(config.days.map(d=>d.date),['2026-11-14','2026-11-15']);
  const schedule=JSON.parse(read('fireball2026/data/schedule.json'));
  for(const day of config.days){
    assert.equal(config.events.filter(e=>e.dayId===day.dayId).length,27);
    assert.equal(config.events.filter(e=>e.dayId===day.dayId&&e.stageId==='special').length,3);
    for(const [stageId,rows] of Object.entries(schedule[day.dayId])){
      const events=config.events.filter(e=>e.dayId===day.dayId&&e.stageId===stageId);
      assert.deepEqual(events.map(e=>[e.start,e.end,e.name]),rows);
      for(let i=1;i<events.length;i++)assert.ok(events[i].startUTC>=events[i-1].endUTC);
    }
  }
  assert.ok(config.events.find(e=>e.name==='洪佩瑜 Pei-Yu Hung ft. ???'));
  const ends=config.events.filter(e=>e.end==='21:40');
  assert.deepEqual(ends.map(e=>e.name),['FEVER 333 (US)','滅火器 Fire EX.']);
  assert.ok(config.events.every(e=>!e.description.isAIGenerated&&!e.description.summary));
});

test('Fireball shares preserve both dates and reject snapshots from other activities',()=>{
  const users=[{id:'a',name:'火球團友',avatar:'🔥',color:'#06b6d4',picks:['day1-special-01','day2-fire-03']}];
  const share='#share='+C.encodeSnapshot(users,config);
  assert.deepEqual(C.decodeSnapshot(share,config)[0].picks,users[0].picks);
  assert.equal(C.storageKey(config),'timetable_picks_fireball2026');
  const other={window:{}};vm.runInNewContext(read('vagabond2026/data/festival.js'),other);
  assert.throws(()=>C.decodeSnapshot(share,C.validateConfig(other.window.FESTIVAL_CONFIG)));
  assert.throws(()=>C.decodeSnapshot('#share='+Buffer.from(JSON.stringify(users)).toString('base64'),config));
  assert.deepEqual(config.compatibility.legacyStorageKeys,[]);
});

test('Fireball page loads shared assets and supports dates, picks, conflicts and exports',async t=>{
  const errors=[],copies=[],blobs=new Map(),downloads=[];
  const assets=new Set(['style.css','core.js','app.js','fireball2026/fireball.css','fireball2026/data/festival.js']);
  class LocalAssets extends ResourceLoader{fetch(url){const u=new URL(url),p=u.pathname.replace(/^\/project\//,'');return u.origin==='https://example.test'&&assets.has(p)?Promise.resolve(Buffer.from(read(p))):null;}}
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(read('fireball2026/index.html'),{url:'https://example.test/project/fireball2026/',runScripts:'dangerously',resources:new LocalAssets(),virtualConsole:console,beforeParse(w){
    w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;w.confirm=()=>true;
    w.localStorage.setItem('timetable_picks_emerge2026','original');
    w.document.execCommand=()=>{copies.push(w.document.querySelector('textarea').value);return true;};
    w.URL.createObjectURL=b=>{const id='blob:test-'+blobs.size;blobs.set(id,b);return id;};w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){downloads.push(blobs.get(this.href));};
  }});
  t.after(()=>dom.window.close());await new Promise(r=>dom.window.addEventListener('load',r,{once:true}));
  const d=dom.window.document,click=s=>{const el=d.querySelector(s);assert.ok(el,s);el.click();};
  assert.deepEqual(errors,[]);assert.ok(d.title.includes('火球祭'));
  assert.equal(d.querySelectorAll('#day-tabs button').length,2);assert.equal(d.querySelectorAll('#timetable-stage-headers > div').length,5);
  assert.ok(d.querySelector('.source-notice').textContent.includes('並非新增的官方舞台'));
  click('#btn-add-user');d.querySelector('#input-new-user-name').value='我的火球';click('#btn-confirm-add-user');
  click('[data-action="toggle-show"][data-show-id="day1-village-01"]');click('[data-action="toggle-show"][data-show-id="day1-special-01"]');
  assert.equal(d.querySelector('#current-clash-count').textContent,'1 處');
  click('[data-action="select-day"][data-day-id="day2"]');click('[data-action="toggle-show"][data-show-id="day2-fire-03"]');
  click('[data-action="open-artist"][data-show-id="day2-fire-03"]');
  assert.equal(d.querySelector('#modal-artist-desc').textContent,'尚無介紹，請參閱官方資訊。');assert.ok(d.querySelector('#artist-ai-notice').classList.contains('hidden'));
  click('#btn-close-artist-modal');click('[data-view="personal"]');click('#btn-copy-text');
  assert.ok(copies.at(-1).includes('火球祭')&&copies.at(-1).includes('火球特別活動')&&copies.at(-1).includes('洪佩瑜'));
  click('#btn-export-ics');const ics=await downloads.at(-1).text();assert.ok(ics.includes('DTSTART:20261115T080000Z'));
  click('#btn-quick-share-url');assert.ok(copies.at(-1).startsWith('https://example.test/project/fireball2026/#share='));
  assert.equal(dom.window.localStorage.getItem('timetable_picks_emerge2026'),'original');
  assert.equal(JSON.parse(dom.window.localStorage.getItem('timetable_picks_fireball2026')).users[0].picks.length,3);
});
