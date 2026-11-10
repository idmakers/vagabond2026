/* Static UI engine. All configuration and user text is assigned with textContent. */
(function () {
  'use strict';
  const C = window.TimetableCore;
  const $ = id => document.getElementById(id);
  function el(tag, className = '', value) {
    const node = document.createElement(tag);
    node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function action(tag, name, values, label, className = '') {
    const node = el(tag, className, label);
    if (tag === 'button') node.type = 'button';
    node.dataset.action = name;
    Object.entries(values || {}).forEach(([key, value]) => { node.dataset[key] = value; });
    return node;
  }
  function error(message) {
    let box = $('config-error');
    if (!box) { box = el('div'); box.id = 'config-error'; document.body.prepend(box); }
    box.setAttribute('role', 'alert');
    box.className = 'mx-4 my-4 rounded-xl border border-red-500 bg-red-950 p-4 text-red-100';
    box.textContent = `無法載入活動設定：${message}`;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }
  function start() {
    let config;
    try { if (!C) throw new Error('核心程式未載入'); config = C.validateConfig(window.FESTIVAL_CONFIG); }
    catch (err) { error(err.message); return; }
    const { meta, days, stages, events } = config;
    const { memberColors, memberAvatars, timeBands } = config.ui;
    document.title = document.body.dataset.page === 'help'
      ? `使用說明｜${meta.festivalName}` : meta.pageTitle || `${meta.festivalName} 看團紀錄表`;
    document.documentElement.style.setProperty('--theme-color', meta.themeColor);
    document.querySelectorAll('[data-festival-name]').forEach(node => { node.textContent = meta.festivalName; });
    document.querySelectorAll('[data-festival-icon]').forEach(node => { node.textContent = meta.icon; });
    document.querySelectorAll('[data-official-link]').forEach(node => {
      if (meta.officialUrl) { node.href = meta.officialUrl; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
      else { node.removeAttribute('href'); node.hidden = true; }
    });
    if (document.body.dataset.page === 'help') return;

    const state = { currentDay: days[0].dayId, currentView: 'grid', pxPerMin: 2.6, users: [], activeUserId: null,
      searchQuery: '', filterOnlySelected: false, filterShowFriends: true,
      newUserAvatar: memberAvatars[0], newUserColor: memberColors[0] };
    let modalEventId = null, toastTimer;
    const buttonClass = 'px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700';
    const selectedClass = ' selected-control';
    const currentDay = () => config.dayById.get(state.currentDay);
    const activeUser = () => state.users.find(u => u.id === state.activeUserId) || state.users[0] || null;
    const dayEvents = () => C.sortedEvents(events.filter(e => e.dayId === state.currentDay), config);
    function ensureActiveUser() { state.activeUserId = activeUser()?.id || null; }
    function toast(message) {
      $('toast-text').textContent = message;
      $('toast-box').classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $('toast-box').classList.add('hidden'), 4000);
    }
    function save() {
      try {
        localStorage.setItem(C.storageKey(config), JSON.stringify({ ...C.snapshot(state.users, config), activeUserId: state.activeUserId }));
        return true;
      } catch { toast('⚠️ 無法儲存至瀏覽器；請保留分享網址或匯出檔案'); return false; }
    }
    function load() {
      try {
        const stored = localStorage.getItem(C.storageKey(config));
        if (stored !== null) {
          const raw = JSON.parse(stored);
          if (raw?.schemaVersion !== 2 || raw.festivalId !== meta.festivalId || !Array.isArray(raw.users)) throw new Error('本機資料格式或活動不符');
          state.users = C.sanitizeUsers(raw.users, config);
          state.activeUserId = raw.activeUserId;
        } else {
          for (const key of config.compatibility.legacyStorageKeys) {
            const legacy = localStorage.getItem(key);
            if (legacy === null) continue;
            const raw = JSON.parse(legacy);
            if (!raw || !Array.isArray(raw.users)) throw new Error('舊版資料格式錯誤');
            state.users = C.sanitizeUsers(raw.users, config);
            state.activeUserId = raw.activeUserId;
            ensureActiveUser();
            if (save()) toast('已將舊紀錄複製到此活動；舊資料仍保留');
            break;
          }
        }
      } catch { toast('⚠️ 本機紀錄無法讀取；未刪除原始資料'); }
      ensureActiveUser();
      importHash();
    }
    function importHash() {
      if (!/^#(?:share|cloud)=/.test(location.hash)) return;
      try {
        const users = C.decodeSnapshot(location.hash, config);
        if (!state.users.length || confirm(`分享中有 ${users.length} 位成員，要取代目前 ${state.users.length} 位成員的紀錄嗎？`)) {
          state.users = users; state.activeUserId = users[0].id; save();
          toast(`已匯入 ${users.length} 位成員的紀錄`);
        }
      } catch (err) { toast(`⚠️ ${err.message}`); }
      // Also works on file:// in browsers that permit history replacement.
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* keep the page usable */ }
    }
    function memberLabel(user) {
      const node = el('span', 'inline-flex items-center gap-1');
      node.append(el('span', '', user.avatar), el('span', '', user.name));
      return node;
    }
    function renderDays() {
      const fragment = document.createDocumentFragment();
      days.forEach(day => {
        const button = action('button', 'select-day', { dayId: day.dayId }, C.dayLabel(day), 'day-tab px-3 py-2 rounded-lg text-xs sm:text-sm font-bold');
        const selected = day.dayId === state.currentDay;
        button.classList.toggle('selected-control', selected);
        button.setAttribute('aria-pressed', String(selected));
        fragment.append(button);
      });
      $('day-tabs').replaceChildren(fragment);
    }
    function renderUsers() {
      const container = $('user-chips-container'); container.replaceChildren();
      if (!state.users.length) container.append(el('span', 'text-xs text-amber-300', '尚未建立成員，請點擊「新增團友」'));
      state.users.forEach(user => {
        const count = events.filter(e => e.dayId === state.currentDay && user.picks.includes(e.id)).length;
        const button = action('button', 'switch-user', { userId: user.id }, undefined, buttonClass);
        button.style.borderColor = user.color;
        button.classList.toggle('selected-control', user.id === state.activeUserId);
        button.setAttribute('aria-pressed', String(user.id === state.activeUserId));
        button.append(memberLabel(user), el('span', 'ml-1', count)); container.append(button);
      });
      const user = activeUser(), conflicts = C.clashes(user, config, state.currentDay);
      $('current-user-count').textContent = `${user ? events.filter(e => e.dayId === state.currentDay && user.picks.includes(e.id)).length : 0} 場`;
      $('current-clash-count').textContent = `${conflicts.length} 處`;
      $('btn-delete-user').classList.toggle('hidden', !user);
    }
    function renderGrid() {
      const day = currentDay(), user = activeUser(), scale = state.pxPerMin;
      const total = day.endMinute - day.startMinute;
      const clashes = new Set(C.clashes(user, config, state.currentDay).flatMap(c => [c.a.id, c.b.id]));
      $('day-time-range').textContent = `${day.timeRange.start}–${day.timeRange.end}${day.endMinute >= 1440 ? '（次日）' : ''}`;
      $('timetable-body-container').style.height = `${total * scale}px`;
      $('timetable-matrix').style.minWidth = `${Math.max(360, stages.length * 145 + 80)}px`;
      const columns = $('timetable-stage-columns'), headers = $('timetable-stage-headers');
      [columns, headers].forEach(node => { node.replaceChildren(); node.style.gridTemplateColumns = `repeat(${stages.length}, minmax(0, 1fr))`; });
      const axis = $('timetable-time-axis'), lines = $('timetable-grid-lines'); axis.replaceChildren(); lines.replaceChildren();
      const ticks = new Set([day.startMinute, day.endMinute]);
      for (let minute = Math.ceil(day.startMinute / 30) * 30; minute <= day.endMinute; minute += 30) ticks.add(minute);
      [...ticks].sort((a, b) => a - b).forEach(minute => {
        const top = (minute - day.startMinute) * scale;
        const label = el('div', 'absolute left-0 right-0 pr-2 text-right font-mono-time text-xs text-slate-300', `${C.formatMinute(minute)}${minute >= 1440 ? '+' : ''}`);
        label.style.top = `${Math.max(0, top - 8)}px`; axis.append(label);
        const line = el('div', `time-grid-line${minute % 60 === 0 ? ' major' : ''}`); line.style.top = `${top}px`; lines.append(line);
      });
      const legend = $('time-band-legend'); legend.replaceChildren();
      timeBands.filter(b => b.dayId === undefined || b.dayId === day.dayId).forEach(band => {
        const range = C.interval(band.start, band.end, day, 'timeBand');
        const node = el('div', 'time-band text-xs text-right pr-2', `${band.start}–${band.end} ${band.label}`);
        node.style.top = `${(range.startMinute - day.startMinute) * scale}px`;
        node.style.height = `${(range.endMinute - range.startMinute) * scale}px`;
        node.style.backgroundColor = band.color + '22'; node.style.borderColor = band.color;
        lines.append(node); legend.append(el('span', '', `${band.start}–${band.end} ${band.label}`));
      });
      stages.forEach(stage => {
        const header = el('div', 'stage-header py-3 px-2 text-center'); header.style.borderTopColor = stage.color;
        header.append(el('div', 'font-bold text-white', stage.name), el('div', 'text-xs text-slate-400', stage.subtitle)); headers.append(header);
        const column = el('div', 'relative'); column.dataset.stageId = stage.id; columns.append(column);
        dayEvents().filter(e => e.stageId === stage.id).forEach(event => {
          const selected = Boolean(user?.picks.includes(event.id));
          const pickers = state.users.filter(u => u.picks.includes(event.id));
          const searchMatch = `${event.name} ${event.description.genre}`.toLocaleLowerCase().includes(state.searchQuery.trim().toLocaleLowerCase());
          const card = action('div', 'toggle-show', { showId: event.id }, undefined, 'show-block p-2 text-xs bg-slate-900 border border-slate-600');
          card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-pressed', String(selected));
          card.setAttribute('aria-label', `${event.start}–${event.end} ${event.name}`);
          card.style.top = `${(event.startMinute - day.startMinute) * scale + 2}px`;
          card.style.height = `${Math.max(1, (event.endMinute - event.startMinute) * scale - 4)}px`;
          card.style.borderLeft = `4px solid ${stage.color}`;
          card.style.opacity = !searchMatch || (state.filterOnlySelected && !selected) ? '0.2' : '1';
          card.classList.toggle('selected-mine', selected); card.classList.toggle('clash-mine', clashes.has(event.id));
          const heading = el('div', 'flex justify-between items-start gap-1');
          const info = action('button', 'open-artist', { showId: event.id }, 'ⓘ', 'shrink-0 rounded-full px-1 bg-slate-800');
          info.setAttribute('aria-label', `查看 ${event.name} 介紹`);
          heading.append(el('span', 'font-mono-time', `${event.start}–${event.end}`), info);
          card.append(heading, el('div', 'font-bold text-sm mt-1', event.name), el('div', 'text-xs text-slate-400', event.description.genre));
          if (state.filterShowFriends && pickers.length) {
            const group = el('div', 'flex flex-wrap gap-1 mt-1');
            pickers.forEach(picker => {
              const badge = el('span', 'rounded px-1 text-slate-950', picker.avatar);
              badge.title = `${picker.name} 想看`; badge.style.backgroundColor = picker.color; group.append(badge);
            }); card.append(group);
          }
          column.append(card);
        });
      });
    }
    function renderCompare() {
      $('compare-day-badge').textContent = C.dayLabel(currentDay());
      const head = $('compare-table-head'), body = $('compare-table-body'); head.replaceChildren(); body.replaceChildren();
      ['時間', '舞台', '演出', '人數'].forEach(value => head.append(el('th', 'p-3', value)));
      state.users.forEach(user => { const th = el('th', 'p-3'); th.append(memberLabel(user)); th.style.borderBottom = `2px solid ${user.color}`; head.append(th); });
      let list = dayEvents();
      if ($('chk-compare-only-picked').checked) list = list.filter(e => state.users.some(u => u.picks.includes(e.id)));
      list.forEach(event => {
        const stage = config.stageById.get(event.stageId), row = el('tr');
        row.append(el('td', 'p-3 font-mono-time', `${event.start}–${event.end}`), el('td', 'p-3', stage.name));
        const cell = el('td', 'p-3'); cell.append(action('button', 'open-artist', { showId: event.id }, event.name, 'text-left font-bold hover:text-cyan-300')); row.append(cell);
        row.append(el('td', 'p-3', state.users.filter(u => u.picks.includes(event.id)).length));
        state.users.forEach(user => {
          const td = el('td', 'p-3 text-center'), picked = user.picks.includes(event.id);
          const button = action('button', 'toggle-user-show', { userId: user.id, showId: event.id }, picked ? '✔' : '+', buttonClass + (picked ? selectedClass : ''));
          button.setAttribute('aria-label', `${user.name}：${event.name}`); button.setAttribute('aria-pressed', String(picked)); td.append(button); row.append(td);
        }); body.append(row);
      });
      if (!list.length) { const row = el('tr'), td = el('td', 'p-6 text-center text-slate-400', '目前沒有符合條件的場次'); td.colSpan = state.users.length + 4; row.append(td); body.append(row); }
    }
    function renderPersonal() {
      const user = activeUser(), list = $('personal-timeline-list'), conflictBox = $('personal-clash-list'); list.replaceChildren(); conflictBox.replaceChildren();
      $('personal-user-title').textContent = user?.name || '尚未建立成員';
      const mine = user ? dayEvents().filter(e => user.picks.includes(e.id)) : [];
      const conflicts = C.clashes(user, config, state.currentDay);
      $('personal-count-badge').textContent = `${mine.length} 場演出`;
      $('personal-clash-badge').textContent = `${conflicts.length} 處衝堂`;
      mine.forEach((event, index) => {
        if (index) {
          const previous = mine[index - 1], gap = (event.startUTC - previous.endUTC) / 60000;
          list.append(el('p', 'text-xs text-slate-400', gap >= 0 ? `換場空檔 ${gap} 分鐘` : `與前場重疊 ${-gap} 分鐘`));
        }
        const card = el('article', 'rounded-xl border border-slate-700 bg-slate-950 p-4');
        card.append(el('p', 'text-xs text-slate-400', `${event.start}–${event.end} · ${config.stageById.get(event.stageId).name}`),
          action('button', 'open-artist', { showId: event.id }, event.name, 'font-bold text-left'));
        const companions = state.users.filter(u => u.id !== user.id && u.picks.includes(event.id));
        if (companions.length) card.append(el('p', 'text-xs mt-2', `👥 同行團友：${companions.map(u => `${u.avatar} ${u.name}`).join('、')}`));
        card.append(action('button', 'toggle-show', { showId: event.id }, '取消此場', buttonClass + ' mt-3')); list.append(card);
      });
      if (!mine.length) list.append(el('p', 'text-slate-400', user ? '此日期尚未勾選演出，請前往時間軸選團。' : '請先新增一位團友。'));
      conflicts.forEach(conflict => {
        const card = el('article', 'rounded-xl border border-red-500/50 p-3');
        card.append(el('p', 'text-red-300 font-bold', `重疊 ${conflict.minutes} 分鐘`));
        [[conflict.a, conflict.b], [conflict.b, conflict.a]].forEach(([keep, remove]) => {
          card.append(el('p', 'text-sm mt-2', `${C.dayLabel(config.dayById.get(keep.dayId))} ${keep.start}–${keep.end} ${keep.name} · ${config.stageById.get(keep.stageId).name}`),
            action('button', 'toggle-show', { showId: remove.id }, '保留此場，取消另一場', buttonClass + ' mt-1'));
        }); conflictBox.append(card);
      });
      if (!conflicts.length) conflictBox.append(el('p', 'text-emerald-300', '目前沒有衝堂。請另外預留步行與休息時間。'));
    }
    function renderModalUsers() {
      if (!modalEventId) return;
      const container = $('modal-group-toggles'); container.replaceChildren();
      state.users.forEach(user => {
        const picked = user.picks.includes(modalEventId);
        const button = action('button', 'toggle-modal-user-show', { userId: user.id, showId: modalEventId }, undefined, buttonClass + (picked ? selectedClass : ''));
        button.append(memberLabel(user), el('span', 'ml-1', picked ? '✔' : '+')); button.setAttribute('aria-pressed', String(picked)); container.append(button);
      });
      if (!state.users.length) container.append(el('p', 'text-slate-400', '尚未建立成員'));
      const user = activeUser(), picked = user?.picks.includes(modalEventId);
      $('modal-btn-toggle-active').classList.toggle('hidden', !user);
      $('modal-btn-toggle-active').textContent = user ? `${picked ? '✔ 已在' : '⭐ 加入'} ${user.name} 名單` : '';
    }
    function openArtist(id) {
      const event = config.eventById.get(id); if (!event) return;
      modalEventId = id;
      const stage = config.stageById.get(event.stageId), description = event.description;
      $('modal-stage-pill').textContent = stage.name; $('modal-stage-pill').style.backgroundColor = stage.color;
      $('modal-time-pill').textContent = `${C.dayLabel(config.dayById.get(event.dayId))} · ${event.start}–${event.end}`;
      $('modal-artist-title').textContent = event.name;
      $('modal-artist-subtitle').textContent = [description.country, description.genre].filter(Boolean).join(' · ');
      $('modal-artist-highlight').textContent = description.highlight;
      $('modal-artist-highlight').classList.toggle('hidden', !description.highlight);
      $('modal-artist-desc').textContent = description.summary || '尚無介紹，請參閱官方資訊。';
      $('artist-ai-notice').classList.toggle('hidden', !description.isAIGenerated);
      $('modal-yt-link').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(event.name)}`;
      $('modal-sp-link').href = `https://open.spotify.com/search/${encodeURIComponent(event.name)}`;
      renderModalUsers(); $('artist-modal').classList.remove('hidden'); $('btn-close-artist-modal').focus();
    }
    function renderPickers() {
      const avatars = $('avatar-picker-grid'), colors = $('color-picker-grid'); avatars.replaceChildren(); colors.replaceChildren();
      memberAvatars.forEach(avatar => {
        const selected = state.newUserAvatar === avatar;
        const button = action('button', 'select-avatar', { avatar }, avatar, buttonClass + (selected ? selectedClass : ''));
        button.setAttribute('aria-pressed', String(selected)); avatars.append(button);
      });
      memberColors.forEach(color => {
        const selected = state.newUserColor === color;
        const button = action('button', 'select-color', { color }, selected ? '✔' : '', 'w-8 h-8 rounded-full border border-white');
        button.style.backgroundColor = color; button.setAttribute('aria-label', color); button.setAttribute('aria-pressed', String(selected)); colors.append(button);
      });
    }
    function openAdd() {
      state.newUserAvatar = memberAvatars[state.users.length % memberAvatars.length];
      state.newUserColor = memberColors[state.users.length % memberColors.length];
      $('input-new-user-name').value = ''; renderPickers(); $('user-modal').classList.remove('hidden'); $('input-new-user-name').focus();
    }
    function render() {
      renderDays(); renderUsers();
      ['grid', 'compare', 'personal'].forEach(view => { $(`view-${view}`).classList.toggle('hidden', view !== state.currentView); });
      document.querySelectorAll('[data-view]').forEach(button => {
        const selected = button.dataset.view === state.currentView;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('selected-control', selected);
      });
      if (state.currentView === 'grid') renderGrid();
      if (state.currentView === 'compare') renderCompare();
      if (state.currentView === 'personal') renderPersonal();
    }
    function toggle(userId, eventId) {
      const user = state.users.find(u => u.id === userId);
      if (!config.eventById.has(eventId)) return;
      if (!user) { openAdd(); toast('請先新增一位團友'); return; }
      const index = user.picks.indexOf(eventId);
      if (index < 0) user.picks.push(eventId); else user.picks.splice(index, 1);
      user.updatedAt = new Intl.DateTimeFormat('zh-TW', { timeZone: meta.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      save(); render(); if (!$('artist-modal').classList.contains('hidden')) renderModalUsers();
    }
    async function copy(value, message) {
      const area = el('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      try {
        let copied = false;
        try { copied = document.execCommand('copy'); } catch { /* try modern API */ }
        if (!copied) { if (!navigator.clipboard) throw new Error('clipboard unavailable'); await navigator.clipboard.writeText(value); }
        toast(message);
      } catch { toast('⚠️ 複製失敗，請使用一般瀏覽器並允許剪貼簿操作'); }
      finally { area.remove(); }
    }
    function download(value, type, filename) {
      const link = el('a'); link.href = URL.createObjectURL(new Blob([value], { type }));
      link.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'); link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    // DOM delegation keeps event data out of executable HTML strings.
    document.addEventListener('click', event => {
      const control = event.target instanceof Element ? event.target.closest('[data-action]') : null;
      if (!control) return;
      const { action: name, userId, showId, dayId, avatar, color } = control.dataset;
      switch (name) {
        case 'select-day': if (config.dayById.has(dayId)) { state.currentDay = dayId; render(); } break;
        case 'switch-user': if (state.users.some(u => u.id === userId)) { state.activeUserId = userId; save(); render(); } break;
        case 'toggle-show': toggle(activeUser()?.id, showId); break;
        case 'toggle-user-show': case 'toggle-modal-user-show': toggle(userId, showId); break;
        case 'open-artist': openArtist(showId); break;
        case 'select-avatar': if (memberAvatars.includes(avatar)) { state.newUserAvatar = avatar; renderPickers(); } break;
        case 'select-color': if (memberColors.includes(color)) { state.newUserColor = color; renderPickers(); } break;
      }
    });
    document.addEventListener('keydown', event => {
      const target = event.target;
      if (target instanceof Element && target.matches('[role="button"][data-action]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); target.click(); }
      if (event.key === 'Escape') { $('artist-modal').classList.add('hidden'); $('user-modal').classList.add('hidden'); }
    });
    document.querySelectorAll('[data-view]').forEach(button => {
      button.className = 'view-tab-btn px-3 py-2 rounded-lg text-xs sm:text-sm text-slate-300 border border-transparent';
      button.addEventListener('click', () => { state.currentView = button.dataset.view; render(); });
    });
    document.querySelectorAll('[data-zoom]').forEach(button => {
      button.className = 'zoom-btn px-2 py-1 rounded';
      button.classList.toggle('selected-control', Number(button.dataset.zoom) === state.pxPerMin);
      button.addEventListener('click', () => {
        const scale = Number(button.dataset.zoom); if (![2, 2.6, 3.5].includes(scale)) return;
        state.pxPerMin = scale;
        document.querySelectorAll('[data-zoom]').forEach(b => { b.classList.toggle('selected-control', b === button); b.setAttribute('aria-pressed', String(b === button)); });
        renderGrid();
      });
    });
    [['btn-filter-selected', 'filterOnlySelected'], ['btn-filter-friends', 'filterShowFriends']].forEach(([id, key]) => {
      const button = $(id); button.setAttribute('aria-pressed', String(state[key])); button.classList.toggle('selected-control', state[key]);
      button.addEventListener('click', () => { state[key] = !state[key]; button.setAttribute('aria-pressed', String(state[key])); button.classList.toggle('selected-control', state[key]); renderGrid(); });
    });
    $('search-input').addEventListener('input', event => { state.searchQuery = event.target.value; $('btn-clear-search').classList.toggle('hidden', !state.searchQuery); renderGrid(); });
    $('btn-clear-search').addEventListener('click', () => { state.searchQuery = ''; $('search-input').value = ''; $('btn-clear-search').classList.add('hidden'); renderGrid(); });
    $('chk-compare-only-picked').addEventListener('change', renderCompare);
    $('btn-add-user').addEventListener('click', openAdd);
    ['btn-close-user-modal', 'btn-cancel-user-modal'].forEach(id => $(id).addEventListener('click', () => $('user-modal').classList.add('hidden')));
    $('btn-confirm-add-user').addEventListener('click', () => {
      const name = $('input-new-user-name').value.trim();
      if (!name) { toast('請輸入成員暱稱'); $('input-new-user-name').focus(); return; }
      if (state.users.length >= C.MAX_USERS) { toast(`最多可建立 ${C.MAX_USERS} 位成員`); return; }
      let id = `u_${Date.now()}`; while (state.users.some(u => u.id === id)) id += '_1';
      state.users.push({ id, name: name.slice(0, 30), avatar: state.newUserAvatar, color: state.newUserColor, picks: [], updatedAt: '' });
      state.activeUserId = id; save(); render(); renderModalUsers(); $('user-modal').classList.add('hidden');
    });
    $('input-new-user-name').maxLength = 30;
    $('input-new-user-name').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('btn-confirm-add-user').click(); } });
    $('btn-delete-user').addEventListener('click', () => {
      const user = activeUser(); if (!user || !confirm(`確定刪除「${user.name}」及其勾選紀錄？`)) return;
      state.users = state.users.filter(u => u.id !== user.id); ensureActiveUser(); save(); render(); renderModalUsers();
    });
    $('btn-clear-all').addEventListener('click', () => {
      if (!state.users.length || !confirm('確定清除本活動所有成員與勾選紀錄？此操作無法復原。')) return;
      state.users = []; state.activeUserId = null; save(); render(); renderModalUsers();
    });
    $('btn-close-artist-modal').addEventListener('click', () => $('artist-modal').classList.add('hidden'));
    $('modal-btn-toggle-active').addEventListener('click', () => { if (modalEventId) toggle(activeUser()?.id, modalEventId); });
    $('btn-quick-share-url').addEventListener('click', () => {
      if (!state.users.length) { toast('請先新增團友'); return; }
      try { copy(`${location.href.split('#')[0]}#share=${C.encodeSnapshot(state.users, config)}`, '已複製全團分享網址；這是當下快照'); }
      catch (err) { toast(`⚠️ ${err.message}`); }
    });
    $('btn-export-csv').addEventListener('click', () => { download(C.csvSchedule(state.users, config), 'text/csv;charset=utf-8', `${meta.festivalName}_團友觀看名單.csv`); toast('已下載全部日期的 CSV 報表'); });
    $('btn-export-ics').addEventListener('click', () => {
      const user = activeUser(); if (!user?.picks.length) { toast('請先新增成員並勾選至少一場演出'); return; }
      download(C.calendarSchedule(user, config), 'text/calendar;charset=utf-8', `${meta.festivalName}_${user.name}.ics`); toast('已下載全部日期的個人行事曆');
    });
    $('btn-copy-text').addEventListener('click', () => { const user = activeUser(); if (!user) { toast('請先新增團友'); return; } copy(C.textSchedule(user, config), '已複製全部日期的文字清單'); });
    window.addEventListener('hashchange', () => { importHash(); render(); renderModalUsers(); });
    load(); render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
