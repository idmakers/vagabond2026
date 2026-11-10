/* Pure configuration, time, persistence-schema and export helpers. No DOM or network. */
(function (root) {
  'use strict';
  const MAX_USERS = 100;
  const MAX_SHARE_LENGTH = 262144;
  const COLOR = /^#[0-9a-f]{6}$/i;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const fallbackColors = ['#06b6d4', '#ec4899', '#10b981', '#f59e0b'];
  const fallbackAvatars = ['🎸', '🎧', '😎', '🌟'];
  const fail = message => { throw new Error(message); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function text(value, field, max = 500, optional = false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${field} 必須是有效文字（最多 ${max} 字元）`);
    return value;
  }
  function identifier(value, field) { return text(value, field, 128); }
  function color(value, field) {
    if (typeof value !== 'string' || !COLOR.test(value)) fail(`${field} 必須是 #RRGGBB 色碼`);
    return value;
  }
  function url(value, field) {
    if (value === undefined || value === '') return '';
    text(value, field, 2048);
    let parsed;
    try { parsed = new URL(value); } catch { fail(`${field} 必須是完整網址`); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) fail(`${field} 只允許不含帳密的 HTTP(S) 網址`);
    return parsed.href;
  }
  function minutes(value, field = '時間') {
    if (typeof value !== 'string' || !clock.test(value)) fail(`${field} 必須是 HH:MM（00:00–23:59）`);
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  }
  function date(value, field = '日期') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${field} 必須是 YYYY-MM-DD`);
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) fail(`${field} 不是有效日期`);
    return parsed;
  }
  function collection(value, field, max, min = 1) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${field} 必須包含 ${min}–${max} 筆資料`);
    return value;
  }
  function unique(items, field) {
    if (new Set(items).size !== items.length) fail(`${field} 不可重複`);
  }
  const formatters = new Map();
  function formatter(timezone) {
    if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    return formatters.get(timezone);
  }
  function wallStamp(epoch, timezone) {
    const parts = Object.fromEntries(formatter(timezone).formatToParts(epoch).map(p => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  }
  // Resolve a local wall time to a unique instant. Reject DST gaps/folds rather
  // than silently exporting a wrong calendar time. No fixed UTC offset assumption.
  function localToUTC(dayDate, minute, timezone) {
    const target = date(dayDate) + minute * 60000;
    const offsets = new Set([-36, -12, 0, 12, 36].map(hour => {
      const sample = target + hour * 3600000;
      return wallStamp(sample, timezone) - sample;
    }));
    const candidates = [...offsets].map(offset => target - offset).filter(epoch => wallStamp(epoch, timezone) === target);
    if (candidates.length !== 1) fail(`${dayDate} ${formatMinute(minute)} 在 ${timezone} 為不存在或重複的夏令時間，請調整活動時間`);
    return candidates[0];
  }
  function formatMinute(value) {
    const wrapped = ((value % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }
  function interval(start, end, day, field) {
    let from = minutes(start, `${field}.start`), to = minutes(end, `${field}.end`);
    if (from === to) fail(`${field} 起迄時間不能相同`);
    if (day.endMinute > 1440 && from < day.startMinute) from += 1440;
    while (to <= from) to += 1440;
    if (from < day.startMinute || to > day.endMinute) fail(`${field} 超出所屬日期的 timeRange`);
    return { startMinute: from, endMinute: to };
  }
  function validateConfig(raw) {
    if (!object(raw) || !object(raw.meta)) fail('缺少 meta 活動設定');
    const id = text(raw.meta.festivalId, 'meta.festivalId', 80);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) fail('festivalId 只允許英數字、底線及連字號');
    const timezone = text(raw.meta.timezone, 'meta.timezone', 100);
    try { formatter(timezone).format(0); } catch { fail('meta.timezone 不是有效的 IANA 時區'); }
    const meta = {
      festivalId: id, festivalName: text(raw.meta.festivalName, 'meta.festivalName', 200),
      pageTitle: text(raw.meta.pageTitle, 'meta.pageTitle', 250, true),
      officialUrl: url(raw.meta.officialUrl, 'meta.officialUrl'), timezone,
      themeColor: color(raw.meta.themeColor === undefined ? '#06b6d4' : raw.meta.themeColor, 'meta.themeColor'),
      venue: text(raw.meta.venue, 'meta.venue', 300, true), icon: text(raw.meta.icon, 'meta.icon', 16, true) || '🎵'
    };
    const days = collection(raw.days, 'days', 366).map((d, index) => {
      if (!object(d) || !object(d.timeRange)) fail(`days[${index}] 格式錯誤`);
      date(d.date, `days[${index}].date`);
      const startMinute = minutes(d.timeRange.start), end = minutes(d.timeRange.end);
      if (startMinute === end) fail('timeRange 起迄時間不能相同');
      return { dayId: identifier(d.dayId, 'dayId'), label: text(d.label, 'day.label', 100), date: d.date,
        timeRange: { start: d.timeRange.start, end: d.timeRange.end }, startMinute,
        endMinute: end < startMinute ? end + 1440 : end };
    });
    unique(days.map(d => d.dayId), 'dayId');
    const stages = collection(raw.stages, 'stages', 50).map((s, i) => {
      if (!object(s)) fail(`stages[${i}] 格式錯誤`);
      return { id: identifier(s.id, 'stage.id'), name: text(s.name, 'stage.name', 100),
        shortName: text(s.shortName, 'stage.shortName', 100, true) || s.name,
        subtitle: text(s.subtitle, 'stage.subtitle', 200, true), color: color(s.color, 'stage.color') };
    });
    unique(stages.map(s => s.id), 'stage.id');
    const dayById = new Map(days.map(d => [d.dayId, d]));
    const stageById = new Map(stages.map(s => [s.id, s]));
    const events = collection(raw.events, 'events', 10000, 0).map((e, i) => {
      if (!object(e)) fail(`events[${i}] 格式錯誤`);
      const day = dayById.get(e.dayId);
      if (!day || !stageById.has(e.stageId)) fail(`events[${i}] 的 dayId 或 stageId 不存在`);
      const range = interval(e.start, e.end, day, `events[${i}]`);
      const description = e.description === undefined ? {} : e.description;
      if (!object(description)) fail('description 必須是物件');
      if (description.isAIGenerated !== undefined && typeof description.isAIGenerated !== 'boolean') fail('isAIGenerated 必須是布林值');
      const event = { id: identifier(e.id, 'event.id'), dayId: e.dayId, stageId: e.stageId,
        name: text(e.name, 'event.name', 300), start: e.start, end: e.end, ...range,
        description: { genre: text(description.genre, 'genre', 500, true), country: text(description.country, 'country', 300, true),
          summary: text(description.summary, 'summary', 10000, true), highlight: text(description.highlight, 'highlight', 2000, true),
          isAIGenerated: description.isAIGenerated === true } };
      event.startUTC = localToUTC(day.date, event.startMinute, timezone);
      event.endUTC = localToUTC(day.date, event.endMinute, timezone);
      if (event.endUTC <= event.startUTC) fail('演出結束時間必須晚於開始時間');
      return event;
    });
    unique(events.map(e => e.id), 'event.id');
    const ui = raw.ui === undefined ? {} : raw.ui;
    if (!object(ui)) fail('ui 必須是物件');
    const memberColors = collection(ui.memberColors === undefined ? fallbackColors : ui.memberColors, 'ui.memberColors', 30).map(c => color(c, 'memberColors'));
    const memberAvatars = collection(ui.memberAvatars === undefined ? fallbackAvatars : ui.memberAvatars, 'ui.memberAvatars', 30).map(a => text(a, 'memberAvatars', 16));
    const timeBands = collection(ui.timeBands === undefined ? [] : ui.timeBands, 'ui.timeBands', 100, 0).map(b => {
      if (!object(b)) fail('timeBands 格式錯誤');
      if (b.dayId !== undefined && !dayById.has(b.dayId)) fail('timeBand.dayId 不存在');
      const result = { label: text(b.label, 'timeBand.label', 200), start: b.start, end: b.end,
        color: color(b.color === undefined ? '#f59e0b' : b.color, 'timeBand.color'), dayId: b.dayId };
      days.filter(d => b.dayId === undefined || b.dayId === d.dayId).forEach(d => interval(b.start, b.end, d, 'timeBand'));
      return result;
    });
    const compatibility = raw.compatibility === undefined ? {} : raw.compatibility;
    if (!object(compatibility)) fail('compatibility 必須是物件');
    if (compatibility.acceptLegacyShare !== undefined && typeof compatibility.acceptLegacyShare !== 'boolean') fail('acceptLegacyShare 必須是布林值');
    const legacyStorageKeys = collection(compatibility.legacyStorageKeys === undefined ? [] : compatibility.legacyStorageKeys, 'legacyStorageKeys', 10, 0).map(k => text(k, 'legacyStorageKey', 200));
    return { meta, days, stages, events, dayById, stageById, eventById: new Map(events.map(e => [e.id, e])),
      ui: { memberColors, memberAvatars, timeBands }, compatibility: { legacyStorageKeys, acceptLegacyShare: compatibility.acceptLegacyShare === true } };
  }
  const storageKey = config => `timetable_picks_${config.meta.festivalId}`;
  function sanitizeUsers(list, config) {
    if (!Array.isArray(list)) return [];
    const seen = new Set(), { memberColors, memberAvatars } = config.ui;
    return list.filter(u => object(u) && typeof u.name === 'string' && u.name.trim()).slice(0, MAX_USERS).map((u, i) => {
      let id = typeof u.id === 'string' && /^[\w-]{1,64}$/.test(u.id) ? u.id : `u_${Date.now()}_${i}`;
      const base = id.slice(0, 56); let suffix = 0;
      while (seen.has(id)) id = `${base}_${++suffix}`;
      seen.add(id);
      return { id, name: u.name.trim().slice(0, 30),
        avatar: memberAvatars.includes(u.avatar) ? u.avatar : memberAvatars[0],
        color: typeof u.color === 'string' && COLOR.test(u.color) ? u.color : memberColors[i % memberColors.length],
        picks: Array.isArray(u.picks) ? [...new Set(u.picks.slice(0, config.events.length * 2).filter(p => typeof p === 'string' && config.eventById.has(p)))] : [],
        updatedAt: typeof u.updatedAt === 'string' ? u.updatedAt.slice(0, 40) : '' };
    });
  }
  function snapshot(users, config) {
    return { schemaVersion: 2, festivalId: config.meta.festivalId,
      users: users.map(({id, name, avatar, color, picks}) => ({id, name, avatar, color, picks})) };
  }
  function validateSnapshot(raw, config) {
    if (Array.isArray(raw)) {
      if (!config.compatibility.acceptLegacyShare) fail('此活動不接受沒有活動識別的舊版分享');
    } else {
      if (!object(raw) || raw.schemaVersion !== 2 || raw.festivalId !== config.meta.festivalId) fail('分享活動或版本不符，未匯入任何資料');
      raw = raw.users;
    }
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_USERS) fail('分享成員數量或格式錯誤');
    if (raw.some(u => !object(u) || typeof u.name !== 'string' || !u.name.trim() || !Array.isArray(u.picks) || u.picks.some(p => typeof p !== 'string' || !config.eventById.has(p)))) fail('分享含無效成員或未知場次，未匯入任何資料');
    return sanitizeUsers(raw, config);
  }
  function encodeSnapshot(users, config) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot(users, config)));
    const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    if (encoded.length + 7 > MAX_SHARE_LENGTH) fail('分享資料過大，請減少成員或勾選場次');
    return encoded;
  }
  function decodeSnapshot(hash, config) {
    if (hash.length > MAX_SHARE_LENGTH) fail('分享資料過大');
    const match = hash.match(/^#(?:share|cloud)=(.+)$/);
    if (!match) fail('分享網址格式錯誤');
    const binary = atob(match[1]);
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return validateSnapshot(JSON.parse(json), config);
  }
  const sortedEvents = (events, config) => [...events].sort((a, b) => a.startUTC - b.startUTC || config.stages.findIndex(s => s.id === a.stageId) - config.stages.findIndex(s => s.id === b.stageId));
  function clashes(user, config, dayId) {
    if (!user) return [];
    const events = sortedEvents(config.events.filter(e => user.picks.includes(e.id)), config), result = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length && events[j].startUTC < events[i].endUTC; j++) {
        const a = events[i], b = events[j];
        if (dayId !== undefined && a.dayId !== dayId && b.dayId !== dayId) continue;
        const overlap = Math.min(a.endUTC, b.endUTC) - Math.max(a.startUTC, b.startUTC);
        if (overlap > 0) result.push({ a, b, minutes: overlap / 60000 });
      }
    }
    return result;
  }
  function dayLabel(day) { return `${day.label} (${day.date})`; }
  function textSchedule(user, config) {
    return `${config.meta.icon} ${config.meta.festivalName}【${user.name}】的看團時間表\n` + config.days.map(day => {
      const events = sortedEvents(config.events.filter(e => e.dayId === day.dayId && user.picks.includes(e.id)), config);
      return `\n${dayLabel(day)}\n${events.map(e => `• ${e.start}-${e.end}${e.endMinute >= 1440 ? '（次日）' : ''} [${config.stageById.get(e.stageId).shortName}] ${e.name}`).join('\n') || '(無)'}`;
    }).join('\n');
  }
  function csvCell(value) {
    let safe = String(value);
    // Spreadsheet formulas are not HTML, but still must not run on CSV open.
    if (/^[\s\uFEFF]*[=+@-]/.test(safe)) safe = "'" + safe;
    return `"${safe.replace(/"/g, '""')}"`;
  }
  function csvSchedule(users, config) {
    const rows = [['Day', 'Date', 'Start', 'End', 'Stage', 'Artist', ...users.map(u => u.name)],
      ...sortedEvents(config.events, config).map(e => [config.dayById.get(e.dayId).label, config.dayById.get(e.dayId).date, e.start, e.end,
        config.stageById.get(e.stageId).name, e.name, ...users.map(u => u.picks.includes(e.id) ? 'V' : '')])];
    return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  const icsText = value => String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const utcStamp = epoch => new Date(epoch).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  function foldLine(line) {
    let result = '', chunk = '', bytes = 0;
    for (const char of line) {
      const length = new TextEncoder().encode(char).length;
      if (bytes + length > 75) { result += chunk + '\r\n'; chunk = ' '; bytes = 1; }
      chunk += char; bytes += length;
    }
    return result + chunk;
  }
  function calendarSchedule(user, config, now = Date.now()) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Event Timetable Engine//Calendar//EN', 'CALSCALE:GREGORIAN'];
    sortedEvents(config.events.filter(e => user.picks.includes(e.id)), config).forEach(e => {
      const stage = config.stageById.get(e.stageId);
      lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(e.id)}@${config.meta.festivalId}.timetable`, `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${utcStamp(e.startUTC)}`, `DTEND:${utcStamp(e.endUTC)}`,
        `SUMMARY:${icsText(`[${config.meta.festivalName}] ${e.name} @ ${stage.name}`)}`,
        `LOCATION:${icsText([config.meta.venue, stage.name].filter(Boolean).join(' — '))}`,
        `DESCRIPTION:${icsText(e.description.highlight || e.description.summary)}`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }
  const api = { MAX_USERS, MAX_SHARE_LENGTH, validateConfig, storageKey, sanitizeUsers, snapshot, validateSnapshot,
    encodeSnapshot, decodeSnapshot, minutes, formatMinute, interval, localToUTC, sortedEvents, clashes, dayLabel,
    textSchedule, csvSchedule, calendarSchedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimetableCore = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
