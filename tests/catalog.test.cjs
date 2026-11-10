const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const C = require('../core.js');
const { resolveShare } = require('../catalog.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = {window:{}}; vm.runInNewContext(read('data/festivals.js'),data);
const catalog = JSON.parse(JSON.stringify(data.window.FESTIVAL_CATALOG));
const hash = data => '#share='+Buffer.from(JSON.stringify(data)).toString('base64');

function renderCatalog(t, {fragment='',search='',items=catalog}={}) {
  const dom=new JSDOM(read('index.html'),{url:'https://example.test/project/index.html'+search+fragment,runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  Object.defineProperty(dom.window.document,'readyState',{value:'complete',configurable:true});
  const redirects=[];
  const location={href:dom.window.location.href,hash:fragment,search,replace:url=>redirects.push(url)};
  vm.runInNewContext(read('catalog.js'),{window:{FESTIVAL_CATALOG:items},document:dom.window.document,location,URL,TextDecoder,Uint8Array,atob});
  return {document:dom.window.document,redirects};
}

test('catalog renders all activity folders and links resolve correctly under a project path',t=>{
  const a=renderCatalog(t);
  assert.equal(a.document.querySelectorAll('.festival-card').length,3);
  assert.equal(a.document.querySelector('[data-festival-id="vagabond2026"]').href,'https://example.test/project/vagabond2026/');
  assert.equal(a.document.querySelector('[data-festival-id="emerge2026"]').href,'https://example.test/project/emerge2026/');
  assert.deepEqual(a.redirects,[]);
});

test('legacy shares route to original activity without changing their hash or query',t=>{
  const users=[{id:'a',name:'測試',picks:['d1-kun-1']}];
  for(const prefix of ['share','cloud']) {
    const fragment=hash(users).replace('#share=',`#${prefix}=`);
    const a=renderCatalog(t,{fragment,search:'?from=old'});
    const target=new URL(a.redirects[0]);
    assert.equal(target.pathname,'/project/vagabond2026/');
    assert.equal(target.hash,fragment);assert.equal(target.search,'?from=old');
    assert.equal(a.document.querySelector('#share-status a').href,target.href);
  }
});

test('versioned shares route only to the matching known activity',t=>{
  for(const item of catalog) {
    const fragment=hash({schemaVersion:2,festivalId:item.id,users:[]});
    const a=renderCatalog(t,{fragment});
    assert.equal(new URL(a.redirects[0]).pathname,`/project/${item.id}/`);
  }
  assert.throws(()=>resolveShare(hash({schemaVersion:2,festivalId:'https://evil.test',users:[]}),catalog));
  assert.throws(()=>resolveShare(hash({schemaVersion:99,festivalId:'vagabond2026',users:[]}),catalog));
});

test('bad hashes and malicious catalog fields do not create executable HTML or external routes',t=>{
  for(const fragment of ['#share=!!!','#cloud=','#share='+'A'.repeat(C.MAX_SHARE_LENGTH),hash({schemaVersion:2,festivalId:'missing',users:[]})]) {
    const a=renderCatalog(t,{fragment});assert.deepEqual(a.redirects,[]);assert.ok(a.document.querySelector('#share-status').textContent.includes('未匯入'));
  }
  const items=JSON.parse(JSON.stringify(catalog));items[0].name='<img src=x onerror=alert(1)>';
  const a=renderCatalog(t,{items});assert.ok(a.document.querySelector('h2').textContent.includes('<img'));assert.equal(a.document.querySelector('img,[onerror]'),null);
  for(const badPath of ['https://evil.test/','javascript:alert(1)','../outside/','//evil.test/']) {
    const invalid=JSON.parse(JSON.stringify(catalog));invalid[0].path=badPath;
    const b=renderCatalog(t,{items:invalid});assert.equal(b.document.querySelectorAll('.festival-card').length,0);assert.deepEqual(b.redirects,[]);
  }
});

test('legacy help redirect preserves privacy anchors and query parameters',t=>{
  const dom=new JSDOM(read('help.html'),{url:'https://example.test/project/help.html?from=old#privacy'});t.after(()=>dom.window.close());
  const redirects=[];
  vm.runInNewContext(read('legacy-help.js'),{document:dom.window.document,location:{href:dom.window.location.href,search:'?from=old',hash:'#privacy',replace:url=>redirects.push(url)},URL});
  assert.equal(redirects[0],'https://example.test/project/vagabond2026/help.html?from=old#privacy');
  assert.equal(dom.window.document.querySelector('#help-link').href,redirects[0]);
});

test('moved activity keeps its exact configuration, event IDs and storage namespace',()=>{
  const source={window:{}};vm.runInNewContext(read('vagabond2026/data/festival.js'),source);
  const config=C.validateConfig(source.window.FESTIVAL_CONFIG);
  assert.equal(config.events.length,74);assert.equal(C.storageKey(config),'timetable_picks_vagabond2026');
  assert.deepEqual(Array.from(config.compatibility.legacyStorageKeys),['vagabond2026_schedule_v1']);
  assert.equal(config.compatibility.acceptLegacyShare,true);
  assert.equal(fs.existsSync(path.join(root,'data/festival.js')),false);
});
