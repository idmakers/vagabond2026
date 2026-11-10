const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const C = require('../core.js');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = { window: {} };
vm.runInNewContext(read('data/festival.js'), source);
const original = JSON.parse(JSON.stringify(source.window.FESTIVAL_CONFIG));
const clone = value => JSON.parse(JSON.stringify(value));
const sample = () => JSON.parse(read('festival-config.sample.json'));
const member = (id = 'alice', name = 'Alice', picks = []) => ({ id, name, avatar: '🎸', color: '#06b6d4', picks });
const legacyHash = (users, prefix = 'share') => `#${prefix}=${Buffer.from(JSON.stringify(users)).toString('base64')}`;
const v2Hash = (users, raw = original) => `#share=${C.encodeSnapshot(users, C.validateConfig(raw))}`;

function threeDays() {
  const raw = sample();
  raw.meta.festivalId = 'another-event';
  raw.meta.festivalName = '另一場三日音樂祭';
  raw.meta.timezone = 'Asia/Tokyo';
  raw.days = [
    { dayId: 'night', label: '夜間場', date: '2027-05-01', timeRange: { start: '18:15', end: '02:00' } },
    { dayId: 'dawn', label: '凌晨場', date: '2027-05-02', timeRange: { start: '00:00', end: '03:00' } },
    { dayId: 'final', label: '最終日', date: '2027-05-03', timeRange: { start: '09:10', end: '12:25' } }
  ];
  raw.events = [
    { id: 'custom/slot:A', dayId: 'night', stageId: 'main', name: '深夜團', start: '23:50', end: '00:40' },
    { id: 'custom/slot:B', dayId: 'dawn', stageId: 'garden', name: '凌晨團', start: '00:10', end: '01:00' },
    { id: 'unicode-場次-三', dayId: 'final', stageId: 'main', name: '第三天團', start: '09:10', end: '10:00' }
  ];
  return raw;
}

async function boot(t, { raw = original, hash = '', stored = {}, page = 'index.html', url } = {}) {
  const errors = [], copies = [], downloads = [], blobs = new Map();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(read(page), {
    url: url || `https://example.test/index.html${hash}`,
    runScripts: 'outside-only', virtualConsole,
    beforeParse(w) {
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.Blob = Blob;
      w.confirm = () => true;
      w.alert = () => { throw new Error('Injected JavaScript executed'); };
      w.URL.createObjectURL = blob => { const id = `blob:test-${blobs.size}`; blobs.set(id, blob); return id; };
      w.URL.revokeObjectURL = () => {};
      w.document.execCommand = () => { copies.push(w.document.querySelector('textarea').value); return true; };
      w.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, blob: blobs.get(this.href) }); };
      for (const [key, value] of Object.entries(stored)) w.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  w.FESTIVAL_CONFIG = clone(raw);
  w.eval(read('core.js')); w.eval(read('app.js'));
  await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
  t.after(() => assert.deepEqual(errors, []));
  const config = (() => { try { return C.validateConfig(raw); } catch { return null; } })();
  const state = () => JSON.parse(w.localStorage.getItem(C.storageKey(config)) || '{"users":[]}');
  const click = selector => { const node = d.querySelector(selector); assert.ok(node, selector); node.click(); };
  const act = (name, field, value) => {
    const node = [...d.querySelectorAll('[data-action]')].find(n => n.dataset.action === name && (!field || n.dataset[field] === value));
    assert.ok(node, `${name} ${value}`); node.click();
  };
  const view = name => click(`[data-view="${name}"]`);
  return { w, d, config, state, click, act, view, copies, downloads };
}
const local = (users, raw = original) => {
  const c = C.validateConfig(raw);
  return { [C.storageKey(c)]: { ...C.snapshot(users, c), activeUserId: users[0]?.id || null } };
};

test('current dataset retains all 74 slots, IDs and corrected artist biography', () => {
  const c = C.validateConfig(original);
  assert.equal(c.events.length, 74); assert.equal(c.days.length, 2); assert.equal(c.stages.length, 7);
  assert.equal(c.eventById.get('d2-xiao-2').description.country, '🇯🇵 日本／東京');
  assert.ok(c.eventById.get('d2-xiao-2').description.summary.includes('Junk Pop'));
});

test('engine and templates contain no activity identifiers or executable HTML assembly', () => {
  for (const file of ['index.html', 'app.js', 'core.js', 'style.css', 'help.html']) {
    const content = read(file);
    assert.doesNotMatch(content, /vagabond|浪人祭|鯤鯓|kunshen|20261107|grid-cols-7/i, file);
    assert.doesNotMatch(content, /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|\bonclick\s*=/i, file);
  }
  assert.doesNotMatch(read('app.js'), /fetch\(|XMLHttpRequest|import\(/);
});

test('sample and schema files parse, and sample config runs without optional settings', () => {
  const raw = sample();
  assert.equal(JSON.parse(read('festival-config.schema.json')).type, 'object');
  delete raw.ui; delete raw.compatibility; delete raw.meta.pageTitle;
  const config = C.validateConfig(raw);
  assert.equal(config.events.length, 3); assert.equal(config.compatibility.acceptLegacyShare, false);
});

test('dates, references, IDs, URLs, colors, times, ranges and timezone are validated', () => {
  const mutations = [
    r => { r.meta.festivalId = '../other'; }, r => { r.meta.timezone = 'Invalid/Zone'; },
    r => { r.meta.officialUrl = 'javascript:alert(1)'; }, r => { r.meta.officialUrl = 'https://user:secret@example.com'; },
    r => { r.meta.themeColor = '#fff; color:red'; }, r => { r.days[0].date = '2027-02-30'; },
    r => { r.days[0].timeRange.start = '25:00'; }, r => { r.days[0].timeRange.end = r.days[0].timeRange.start; },
    r => { r.events[0].dayId = 'missing'; }, r => { r.events[0].stageId = 'missing'; },
    r => { r.events[1].id = r.events[0].id; }, r => { r.stages[1].id = r.stages[0].id; },
    r => { r.days[1].dayId = r.days[0].dayId; }, r => { r.events[0].start = '01:00'; },
    r => { r.events[0].end = r.events[0].start; }, r => { r.events[0].description.isAIGenerated = 'false'; },
    r => { r.ui.memberColors = []; }, r => { r.ui.timeBands = [{label:'bad', start:'01:00', end:'02:00'}]; }
  ];
  mutations.forEach(mutate => { const raw = sample(); mutate(raw); assert.throws(() => C.validateConfig(raw)); });
});

test('three days, two stages and arbitrary slot structures render solely from config', async t => {
  const raw = threeDays(); const a = await boot(t, { raw });
  assert.equal(a.d.querySelectorAll('#day-tabs button').length, 3);
  assert.equal(a.d.querySelectorAll('#timetable-stage-headers > div').length, 2);
  assert.equal(a.d.querySelector('#timetable-stage-columns').style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(a.d.querySelector('#timetable-body-container').style.height, `${465 * 2.6}px`);
  a.act('select-day', 'dayId', 'final');
  assert.equal(a.d.querySelector('#timetable-body-container').style.height, `${195 * 2.6}px`);
  const card = a.d.querySelector('[data-action="toggle-show"]');
  assert.equal(card.dataset.showId, 'unicode-場次-三'); assert.equal(card.style.top, '2px');
  assert.equal(a.d.querySelector('#day-time-range').textContent, '09:10–12:25');
  assert.equal(a.d.title, raw.meta.pageTitle);
});

test('overnight events and cross-day collisions use real instants and correct positions', async t => {
  const raw = threeDays(), config = C.validateConfig(raw), user = member('a', 'A', config.events.map(e => e.id));
  const conflicts = C.clashes(user, config, 'night');
  assert.equal(conflicts.length, 1); assert.equal(conflicts[0].minutes, 30);
  assert.equal(C.clashes(user, config, 'dawn').length, 1);
  const a = await boot(t, { raw, stored: local([user], raw) });
  const card = a.d.querySelector('[data-action="toggle-show"]');
  assert.equal(card.style.top, `${335 * 2.6 + 2}px`);
  a.view('personal'); a.click('#personal-clash-list button');
  assert.equal(C.clashes(a.state().users[0], config).length, 0);
});

test('timezone conversion supports DST and rejects non-existent or ambiguous local times', () => {
  assert.equal(new Date(C.localToUTC('2027-05-01', 12 * 60, 'Asia/Tokyo')).toISOString(), '2027-05-01T03:00:00.000Z');
  assert.equal(new Date(C.localToUTC('2027-03-14', 3 * 60 + 30, 'America/New_York')).toISOString(), '2027-03-14T07:30:00.000Z');
  assert.throws(() => C.localToUTC('2027-03-14', 150, 'America/New_York'), /夏令時間/);
  assert.throws(() => C.localToUTC('2027-11-07', 90, 'America/New_York'), /夏令時間/);
});

test('malicious configuration text and IDs render inert; AI notice follows each flag', async t => {
  const raw = sample();
  raw.meta.festivalName = '<img src=x onerror=alert(1)>';
  raw.meta.pageTitle = '<script>alert(1)</script>';
  raw.stages[0].id = '<img src=x onerror=alert(1)>';
  raw.stages[0].name = '<svg onload=alert(1)>';
  raw.events[0].stageId = raw.stages[0].id;
  raw.events[2].stageId = raw.stages[0].id;
  raw.events[0].id = 'slot/" onclick="alert(1)';
  raw.events[0].name = '<img src=x onerror=alert(1)>';
  raw.events[0].description.summary = '<svg onload=alert(1)>';
  raw.events[0].description.isAIGenerated = true;
  const a = await boot(t, { raw });
  a.act('open-artist', 'showId', raw.events[0].id);
  assert.equal(a.d.querySelector('#modal-artist-desc').textContent, raw.events[0].description.summary);
  assert.equal(a.d.querySelector('#artist-ai-notice').classList.contains('hidden'), false);
  a.click('#btn-close-artist-modal'); a.act('open-artist', 'showId', raw.events[1].id);
  assert.equal(a.d.querySelector('#artist-ai-notice').classList.contains('hidden'), true);
  assert.equal(a.d.querySelectorAll('img, svg, [onerror], [onclick], [onload]').length, 0);
});

test('malicious share and saved member fields are inert across all views and modals', async t => {
  const users = [{ ...member("x');alert(1)//", '<svg onload=alert(1)>', ['d1-kun-1']), avatar: '<img src=x>', color: '#fff;" onload="x' }, member('bob', '<b>Bob</b>', ['d1-kun-1'])];
  for (const fromStorage of [false, true]) {
    const a = await boot(t, fromStorage ? { stored: local(users) } : { hash: v2Hash(users) });
    for (const mode of ['grid', 'compare', 'personal']) {
      a.view(mode);
      assert.ok(a.d.querySelector('#user-chips-container').textContent.includes(users[0].name));
      assert.equal(a.d.querySelectorAll('img, svg, [onerror], [onclick], [onload]').length, 0);
    }
    a.view('compare'); a.click('#chk-compare-only-picked');
    assert.ok(a.d.querySelector('#compare-table-head').textContent.includes(users[0].name));
    a.act('open-artist', 'showId', 'd1-kun-1');
    assert.ok(a.d.querySelector('#modal-group-toggles').textContent.includes(users[0].name));
    const normalized = a.w.TimetableCore.sanitizeUsers(users, a.config);
    assert.match(normalized[0].id, /^[\w-]{1,64}$/); assert.match(normalized[0].color, /^#[a-f\d]{6}$/i);
    assert.equal(normalized[0].avatar, a.config.ui.memberAvatars[0]);
  }
});

test('member creation, picker redraws, switching, delete, and clear retain expected behavior', async t => {
  const a = await boot(t);
  a.click('#btn-add-user'); a.act('select-avatar', 'avatar', '🎸'); a.act('select-color', 'color', '#ec4899');
  a.d.querySelector('#input-new-user-name').value = '<b>Alice</b>'; a.click('#btn-confirm-add-user');
  assert.equal(a.state().users[0].name, '<b>Alice</b>'); assert.equal(a.state().users[0].avatar, '🎸'); assert.equal(a.state().users[0].color, '#ec4899');
  a.click('#btn-add-user'); a.d.querySelector('#input-new-user-name').value = 'Bob';
  a.d.querySelector('#input-new-user-name').dispatchEvent(new a.w.KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
  assert.equal(a.state().users.length, 2);
  const firstId = a.state().users[0].id;
  a.act('switch-user', 'userId', firstId); assert.equal(a.state().activeUserId, firstId);
  a.click('#btn-delete-user'); assert.equal(a.state().users.length, 1);
  a.click('#btn-clear-all'); assert.equal(a.state().users.length, 0);
});

test('card, nested info button, modal picks, comparison, keyboard and personal cancellations', async t => {
  const a = await boot(t, { stored: local([member(), member('bob', 'Bob')]) });
  a.act('toggle-show', 'showId', 'd1-kun-1');
  assert.deepEqual(a.state().users[0].picks, ['d1-kun-1']);
  a.act('open-artist', 'showId', 'd1-kun-1'); // Must not also toggle its parent.
  assert.deepEqual(a.state().users[0].picks, ['d1-kun-1']);
  a.act('toggle-modal-user-show', 'userId', 'bob'); assert.deepEqual(a.state().users[1].picks, ['d1-kun-1']);
  a.click('#modal-btn-toggle-active'); assert.deepEqual(a.state().users[0].picks, []);
  a.click('#btn-close-artist-modal');
  a.d.querySelector('[data-action="toggle-show"]').dispatchEvent(new a.w.KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
  assert.equal(a.state().users[0].picks.length, 1);
  a.view('compare'); a.act('toggle-user-show', 'userId', 'alice');
  a.view('personal');
  if (a.d.querySelector('#personal-timeline-list button[data-action="toggle-show"]')) a.click('#personal-timeline-list button[data-action="toggle-show"]');
  a.act('select-day', 'dayId', 'd2'); a.view('grid'); a.act('toggle-show', 'showId', 'd2-xiao-2');
  assert.ok(a.state().users[0].picks.includes('d2-xiao-2'));
});

test('search, zoom, selected and friend filters survive grid redraws', async t => {
  const a = await boot(t, { stored: local([member('alice', 'Test', ['d1-kun-1'])]) });
  a.click('#btn-filter-selected'); assert.equal(a.d.querySelector('[data-show-id="d1-kun-2"]').style.opacity, '0.2');
  a.click('#btn-filter-selected'); a.click('#btn-filter-friends'); a.click('#btn-filter-friends');
  a.click('[data-zoom="3.5"]'); assert.equal(a.d.querySelector('#timetable-body-container').style.height, '2310px');
  const input = a.d.querySelector('#search-input'); input.value = 'Been Stellar'; input.dispatchEvent(new a.w.Event('input', { bubbles:true }));
  assert.equal(a.d.querySelector('[data-show-id="d1-kun-1"]').style.opacity, '0.2');
  a.click('#btn-clear-search'); assert.equal(input.value, '');
  a.act('toggle-show', 'showId', 'd1-kun-1'); assert.deepEqual(a.state().users[0].picks, []);
});

test('v2 unicode sharing round-trips; existing users can decline replacement', async t => {
  const users = [member('alice', '小明 🎸', ['d1-kun-1', 'd2-xiao-2'])];
  const a = await boot(t, { stored: local(users) }); a.click('#btn-quick-share-url');
  const hash = new URL(a.copies.at(-1)).hash;
  const decoded = JSON.parse(Buffer.from(hash.split('=')[1], 'base64').toString());
  assert.equal(decoded.schemaVersion, 2); assert.equal(decoded.festivalId, original.meta.festivalId);
  const b = await boot(t, {hash}); assert.equal(b.state().users[0].name, '小明 🎸'); assert.deepEqual(b.state().users[0].picks, users[0].picks);
  b.w.confirm = () => false;
  const different = member('other', 'Do not import');
  b.w.location.hash = v2Hash([different]);
  b.w.dispatchEvent(new b.w.HashChangeEvent('hashchange'));
  assert.equal(b.state().users[0].name, '小明 🎸');
});

test('same-origin activity storage is isolated and mismatched v2 snapshots never overwrite it', async t => {
  const raw = threeDays(), other = C.validateConfig(raw);
  const stored = { ...local([member('a','Original')]), ...local([member('b','Other',['custom/slot:A'])], raw) };
  const a = await boot(t, {raw, stored, hash:v2Hash([member('bad','Wrong activity')])});
  assert.equal(a.state().users[0].name, 'Other');
  assert.equal(JSON.parse(a.w.localStorage.getItem(C.storageKey(C.validateConfig(original)))).users[0].name,'Original');
  a.click('#btn-clear-all'); assert.equal(a.state().users.length, 0);
  assert.equal(JSON.parse(a.w.localStorage.getItem(C.storageKey(C.validateConfig(original)))).users[0].name,'Original');
  assert.throws(() => C.decodeSnapshot(legacyHash([member()]),other));
});

test('legacy local migration keeps original data; existing empty namespace prevents resurrection', async t => {
  const legacyKey = original.compatibility.legacyStorageKeys[0];
  const saved = { users:[member('a','Legacy',['d1-kun-1'])], activeUserId:'a' };
  const a = await boot(t, {stored:{[legacyKey]:saved}});
  assert.equal(a.state().users[0].name,'Legacy'); assert.equal(JSON.parse(a.w.localStorage.getItem(legacyKey)).users[0].name,'Legacy');
  const b = await boot(t, {stored:{[legacyKey]:saved,...local([])}}); assert.equal(b.state().users.length,0);
  for (const prefix of ['share','cloud']) {
    const c = await boot(t,{hash:legacyHash(saved.users,prefix)}); assert.equal(c.state().users[0].name,'Legacy');
  }
});

test('bad, huge, empty, wrong-version and unknown-slot shares preserve existing records', async t => {
  const bad = ['#share=!!!','#share='+'A'.repeat(C.MAX_SHARE_LENGTH),legacyHash([]),legacyHash({users:[]}),
    legacyHash(Array.from({length:101},(_,i)=>member(`u${i}`))),legacyHash([member('a','Bad',['unknown'])]),
    legacyHash({schemaVersion:99,festivalId:original.meta.festivalId,users:[member()]})];
  for (const hash of bad) {
    const a = await boot(t,{stored:local([member('keep','Keep')]),hash});
    assert.equal(a.state().users[0].name,'Keep'); assert.equal(a.w.location.hash,'');
  }
});

test('CSV, ICS and text exports use all configured days, stage names, safe escaping and UTC', async t => {
  const raw=threeDays(); raw.events[0].description={summary:'Line 1\nBEGIN:VEVENT,;\\中文'};
  raw.stages[0].name='主舞台,"測試"';
  const config=C.validateConfig(raw), user=member('a','=SUM(1,2)',config.events.map(e=>e.id));
  const a=await boot(t,{raw,stored:local([user],raw)});
  a.view('compare'); a.click('#btn-export-csv');
  const csv=await a.downloads.at(-1).blob.text(); assert.ok(csv.includes('最終日')); assert.ok(csv.includes('主舞台,""測試""')); assert.ok(csv.includes("'=SUM(1,2)"));
  a.view('personal'); a.click('#btn-export-ics');
  const ics=await a.downloads.at(-1).blob.text(); assert.equal((ics.match(/^BEGIN:VEVENT\r?$/gm)||[]).length,3);
  assert.ok(ics.includes('DTSTART:20270501T145000Z')); assert.ok(ics.includes('DTEND:20270501T154000Z'));
  assert.ok(ics.replace(/\r\n /g, '').includes('\\nBEGIN:VEVENT\\,\\;\\\\中文'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line)<=75);
  a.click('#btn-copy-text'); const txt=a.copies.at(-1); assert.ok(txt.includes('最終日')); assert.ok(txt.includes('[主舞台]')); assert.ok(txt.includes('unicode')===false);
  assert.ok(a.downloads.at(-1).name.startsWith(raw.meta.festivalName));
});

test('invalid config fails visibly, help is generic, no server required for file URL rendering', async t => {
  const bad=sample(); bad.meta.officialUrl='javascript:alert(1)';
  const a=await boot(t,{raw:bad}); assert.ok(a.d.querySelector('#config-error').textContent.includes('無法載入'));
  assert.equal(a.d.querySelectorAll('#timetable-stage-columns > div').length,0);
  const help=await boot(t,{raw:sample(),page:'help.html'}); assert.ok(help.d.title.includes('範例音樂祭'));
  const file=await boot(t,{raw:sample(),url:'file:///tmp/index.html'}); assert.equal(file.d.querySelectorAll('#day-tabs button').length,2);
});

test('schema sanitization handles duplicates, invalid types, bounded IDs and obsolete local picks', () => {
  const config=C.validateConfig(original), long='a'.repeat(64);
  const users=C.sanitizeUsers([null,[],{name:42},{...member(long,'A'.repeat(100),['d1-kun-1','d1-kun-1','fake']),color:['#ffffff'],avatar:['🎸']},member(long,'B')],config);
  assert.equal(users.length,2); assert.equal(users[0].name.length,30); assert.notEqual(users[0].id,users[1].id);
  assert.ok(users[1].id.length<=64); assert.equal(users[0].avatar,config.ui.memberAvatars[0]); assert.notEqual(users[0].color,'#ffffff');
  assert.deepEqual(users[0].picks,['d1-kun-1']);
});

test('actual deferred asset order works under a project subpath and file URLs', async t => {
  for (const base of ['https://example.test/project/index.html','file:///tmp/project/index.html']) {
    const requested = [], errors = [];
    class LocalAssets extends ResourceLoader {
      fetch(url) {
        const file = ['data/festival.js','core.js','app.js','style.css'].find(name => new URL(url).pathname.endsWith('/'+name));
        if (!file) return null; // No external network or CDN is used in tests.
        requested.push(file);
        return Promise.resolve(Buffer.from(read(file)));
      }
    }
    const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(read('index.html'), { url:base, resources:new LocalAssets(), runScripts:'dangerously', virtualConsole:console,
      beforeParse(w) { w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder; }
    });
    t.after(()=>dom.window.close());
    await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
    assert.deepEqual(errors,[]); assert.equal(dom.window.document.querySelectorAll('#day-tabs button').length,2);
    assert.equal(dom.window.document.querySelectorAll('#timetable-stage-headers > div').length,7);
    assert.equal(dom.window.document.title,original.meta.pageTitle);
    assert.deepEqual(requested.filter(name=>name.endsWith('.js')),['data/festival.js','core.js','app.js']);
  }
});
