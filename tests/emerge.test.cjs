const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const C = require('../core.js');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = { window: {} };
vm.runInNewContext(read('emerge2026/data/festival.js'), data);
const raw = JSON.parse(JSON.stringify(data.window.FESTIVAL_CONFIG));
const config = C.validateConfig(raw);

test('Emerge image transcription contains 44 and 42 slots in seven areas without inventing DAZN events', () => {
  assert.equal(config.events.length, 86); assert.equal(config.stages.length, 7);
  assert.deepEqual(config.days.map(d=>d.date), ['2026-02-28','2026-03-01']);
  assert.equal(config.events.filter(e=>e.dayId==='day1').length,44);
  assert.equal(config.events.filter(e=>e.dayId==='day2').length,42);
  assert.equal(config.events.filter(e=>e.stageId==='dazn').length,0);
  assert.equal(config.days[0].timeRange.start,'10:40');
  assert.ok(config.events.every(e=>!e.description.isAIGenerated && !e.description.summary && !e.description.country && !e.description.genre));
  assert.equal(config.compatibility.acceptLegacyShare,false);
  assert.deepEqual(config.compatibility.legacyStorageKeys,[]);
});

test('key image details retain the short warmup, contiguous idol sets and the joint performance', () => {
  const byName = name => config.events.find(e=>e.name===name);
  for (const [name,start,end] of [
    ['DAZN ft. 健身工廠 早操時間','10:40','10:50'],
    ['Happy Holiday!!','13:50','14:20'],['THEΔRAREz','14:20','14:50'],['月宵◇クレシェンテ','14:50','15:20'],
    ['溫蒂漫步 Wendy Wander × Billyrrom','20:00','21:10'],['Night Keepers 守夜人 ft. XinU','19:00','19:50'],
    ['步行者 Pacers','21:30','22:00'],['美秀集團','21:10','21:50']
  ]) { const event=byName(name); assert.ok(event,name); assert.equal(event.start,start); assert.equal(event.end,end); }
  for(const day of config.days) for(const stage of config.stages) {
    const events=C.sortedEvents(config.events.filter(e=>e.dayId===day.dayId&&e.stageId===stage.id),config);
    for(let i=1;i<events.length;i++) assert.ok(events[i].startUTC>=events[i-1].endUTC,`Unexpected overlap: ${events[i].name}`);
  }
});

test('human transcription matches the runtime configuration exactly', () => {
  const schedule=JSON.parse(read('emerge2026/data/schedule.json'));
  for(const [dayId,columns] of Object.entries(schedule)) for(const [stageId,rows] of Object.entries(columns)) {
    assert.deepEqual(config.events.filter(e=>e.dayId===dayId&&e.stageId===stageId).map(e=>[e.start,e.end,e.name]),rows);
  }
});

test('Emerge shares are activity-bound and cannot import old or Vagabond snapshots', () => {
  const user={id:'test',name:'測試團友',avatar:'🎸',color:'#06b6d4',picks:['day1-emerge-01','day2-scene-06']};
  const hash='#share='+C.encodeSnapshot([user],config);
  assert.deepEqual(C.decodeSnapshot(hash,config)[0].picks,user.picks);
  assert.equal(C.storageKey(config),'timetable_picks_emerge2026');
  const original={window:{}}; vm.runInNewContext(read('vagabond2026/data/festival.js'),original);
  assert.throws(()=>C.decodeSnapshot(hash,C.validateConfig(original.window.FESTIVAL_CONFIG)));
  assert.throws(()=>C.decodeSnapshot('#share='+Buffer.from(JSON.stringify([user])).toString('base64'),config));
});

test('Emerge routes load the shared engine correctly and support member picks, dates and exports', async t => {
  const errors=[],copies=[],downloads=[],blobs=new Map();
  const allowed=new Set(['style.css','core.js','app.js','emerge2026/emerge.css','emerge2026/data/festival.js']);
  class Assets extends ResourceLoader {
    fetch(url) {
      const u=new URL(url); if(u.origin!=='https://example.test') return null;
      const relative=u.pathname.replace(/^\/project\//,'');
      return allowed.has(relative)?Promise.resolve(Buffer.from(read(relative))):null;
    }
  }
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(read('emerge2026/index.html'),{
    url:'https://example.test/project/emerge2026/index.html',resources:new Assets(),runScripts:'dangerously',virtualConsole:console,
    beforeParse(w) {
      w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;w.confirm=()=>true;
      w.localStorage.setItem('timetable_picks_vagabond2026',JSON.stringify({users:[{id:'original',name:'原活動'}]}));
      w.document.execCommand=()=>{copies.push(w.document.querySelector('textarea').value);return true;};
      w.URL.createObjectURL=blob=>{const id='blob:test-'+blobs.size;blobs.set(id,blob);return id;};w.URL.revokeObjectURL=()=>{};
      w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
    }
  });
  t.after(()=>dom.window.close());
  await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
  const d=dom.window.document,click=s=>{const n=d.querySelector(s);assert.ok(n,s);n.click();};
  assert.deepEqual(errors,[]);assert.equal(d.querySelectorAll('#day-tabs button').length,2);
  assert.equal(d.querySelectorAll('#timetable-stage-headers > div').length,7);
  assert.equal(d.querySelector('#timetable-body-container').style.height,'1768px');
  assert.ok(d.title.includes('浮現祭')); assert.ok(d.querySelector('.source-notice').textContent.includes('DAZN'));
  assert.equal(d.querySelectorAll('[data-action="toggle-show"][aria-pressed="true"]').length,0);
  click('#btn-add-user');d.querySelector('#input-new-user-name').value='我的浮現祭';click('#btn-confirm-add-user');
  click('[data-action="toggle-show"][data-show-id="day1-emerge-01"]');
  click('[data-action="select-day"][data-day-id="day2"]');
  click('[data-action="toggle-show"][data-show-id="day2-scene-06"]');
  click('[data-action="open-artist"][data-show-id="day2-scene-06"]');
  assert.ok(d.querySelector('#artist-ai-notice').classList.contains('hidden'));
  assert.equal(d.querySelector('#modal-artist-desc').textContent,'尚無介紹，請參閱官方資訊。');
  click('#btn-close-artist-modal');click('[data-view="personal"]');click('#btn-copy-text');
  assert.ok(copies.at(-1).includes('浮現祭')&&copies.at(-1).includes('早操')&&copies.at(-1).includes('Billyrrom'));
  click('#btn-export-ics');const ics=await downloads.at(-1).blob.text();
  assert.ok(ics.includes('DTSTART:20260228T024000Z')); assert.ok(ics.includes('DTSTART:20260301T120000Z'));
  click('#btn-quick-share-url');assert.ok(copies.at(-1).startsWith('https://example.test/project/emerge2026/index.html#share='));
  assert.equal(JSON.parse(dom.window.localStorage.getItem('timetable_picks_vagabond2026')).users[0].name,'原活動');
  assert.equal(JSON.parse(dom.window.localStorage.getItem('timetable_picks_emerge2026')).users[0].picks.length,2);
});
