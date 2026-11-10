(function () {
  'use strict';
  const MAX_HASH_LENGTH = 262144;
  function node(tag, className, value) {
    const element = document.createElement(tag);
    element.className = className || '';
    if (value !== undefined) element.textContent = value;
    return element;
  }
  function readCatalog() {
    const items = window.FESTIVAL_CATALOG;
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('活動列表尚未設定');
    const ids = new Set(); let defaults = 0;
    return items.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(item.id) || ids.has(item.id)) throw new Error('活動識別格式錯誤或重複');
      if (typeof item.path !== 'string' || !/^\.\/[a-zA-Z0-9_-]+\/$/.test(item.path)) throw new Error('活動路徑必須是本站資料夾');
      for (const key of ['name', 'dates', 'venue', 'summary', 'icon']) {
        if (typeof item[key] !== 'string' || item[key].length > 300) throw new Error('活動列表文字格式錯誤');
      }
      if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error('活動色碼格式錯誤');
      ids.add(item.id);
      if (item.legacyDefault === true && ++defaults > 1) throw new Error('只能指定一個舊版預設活動');
      return item;
    });
  }
  function resolveShare(hash, items) {
    if (!/^#(?:share|cloud)=/.test(hash)) return null;
    if (hash.length > MAX_HASH_LENGTH) throw new Error('分享內容過大，請使用原活動頁面或重新取得連結');
    const match = hash.match(/^#(?:share|cloud)=(.+)$/);
    if (!match) throw new Error('分享網址格式錯誤');
    const binary = atob(match[1]);
    const data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
    const target = Array.isArray(data)
      ? items.find(item => item.legacyDefault === true)
      : data && data.schemaVersion === 2 && typeof data.festivalId === 'string'
        ? items.find(item => item.id === data.festivalId) : null;
    if (!target) throw new Error('無法識別分享所屬活動，未匯入任何資料');
    return target;
  }
  function start() {
    const list = document.getElementById('festival-list'), status = document.getElementById('share-status');
    let items;
    try { items = readCatalog(); }
    catch (err) { status.textContent = err.message; return; }
    items.forEach(item => {
      const card = node('a', 'festival-card'); card.href = item.path; card.dataset.festivalId = item.id;
      card.style.setProperty('--accent', item.color);
      card.append(node('span','festival-icon',item.icon),node('h2','',item.name),node('p','dates',item.dates),
        node('p','',item.venue),node('p','',item.summary),node('span','open-link','開啟時間表 →'));
      list.append(card);
    });
    try {
      const target = resolveShare(location.hash, items);
      if (target) {
        status.textContent = `正在前往 ${target.name}，分享內容將在活動頁驗證後匯入。`;
        const url = new URL(target.path, location.href);
        url.search = location.search;
        url.hash = location.hash;
        const link = node('a', '', ' 若未自動跳轉，請點此開啟。'); link.href = url.href; status.append(link);
        location.replace(url.href);
      }
    } catch { status.textContent = '⚠️ 分享格式無效、內容過大或活動不符，未匯入任何資料。請向分享者重新取得連結。'; }
  }
  // Export only the pure route resolver for regression tests; no data is imported here.
  if (typeof module !== 'undefined' && module.exports) module.exports = { readCatalog, resolveShare };
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
