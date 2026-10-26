// Runs inside the a2.atlantis.education window. Adds buttons and scrapes the
// timetable currently on screen (time-based or block-based view).
const { ipcRenderer } = require('electron');

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_RE = /(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until)\s*(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i;
const TIME_RE_G = new RegExp(TIME_RE.source, 'gi');
const DAY_RE = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i;
const ROOM_RE = /\b(room|rm|lab|gym|hall|theatre|theater|library|studio|oval|court)\b|^[A-Za-z]{0,3}[-\s]?\d{1,3}[A-Za-z]?$/i;
const BLOCK_RE = /\b([Bb]lock|[Pp]eriod)\s*(\d{1,2}|[A-Z])\b/;
const BLOCK_RE_G = new RegExp(BLOCK_RE.source, 'g');

const pad = (n) => String(n).padStart(2, '0');

function to24(h, m, mer, otherMer) {
  h = Number(h);
  const meridiem = (mer || otherMer || '').toLowerCase().replace(/\./g, '');
  if (meridiem.startsWith('p') && h < 12) h += 12;
  else if (meridiem.startsWith('a') && h === 12) h = 0;
  else if (!meridiem && h >= 1 && h <= 6) h += 12;
  return `${pad(h)}:${m}`;
}

function parseRange(text) {
  const m = (text || '').match(TIME_RE);
  if (!m) return null;
  let start = to24(m[1], m[2], m[3], m[6]);
  const end = to24(m[4], m[5], m[6], m[3]);
  if (start > end && !m[3]) start = to24(m[1], m[2], 'am');
  if (start >= end) return null;
  return { start, end, raw: m[0] };
}

function blockLabel(t) {
  const m = (t || '').match(BLOCK_RE);
  return m ? { label: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`, raw: m[0] } : null;
}

function dayFromText(t) {
  const m = t && t.match(DAY_RE);
  return m ? DAY_NAMES.indexOf(m[1].toLowerCase()) : -1;
}

function findDay(card) {
  let d = dayFromText(card.innerText);
  if (d >= 0) return d;
  const cell = card.closest('td,th');
  if (cell) {
    const table = cell.closest('table');
    const headRow = table && (table.querySelector('thead tr') || table.querySelector('tr'));
    const head = headRow && headRow.children[cell.cellIndex];
    d = dayFromText(head && head.innerText);
    if (d >= 0) return d;
  }
  let node = card;
  for (let up = 0; up < 6 && node && node !== document.body; up++) {
    let sib = node.previousElementSibling;
    while (sib) {
      const t = (sib.innerText || '').trim();
      if (t && t.length < 60) { d = dayFromText(t); if (d >= 0) return d; }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  d = dayFromText((document.querySelector('h1,h2') || {}).innerText);
  return d >= 0 ? d : -1;
}

function subjectRoom(lines) {
  let roomLine = lines.find((l) => ROOM_RE.test(l));
  if (!roomLine) roomLine = lines.slice(1).find((l) => /\d/.test(l) && l.length <= 15);
  const subject = lines.find((l) => l !== roomLine && !(DAY_RE.test(l) && l.length < 12)) || 'Class';
  const room = (roomLine || '').replace(/^(room|rm)\s*[:\-]?\s*/i, '');
  return { subject, room };
}

function cleanLines(text, strip) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => strip.reduce((acc, r) => (r ? acc.replace(r, '') : acc), s).trim())
    .filter((s) => s && !TIME_RE.test(s) && !/^(am|pm|-|–)$/i.test(s));
}

function addEntry(list, seen, e) {
  const key = [e.day, e.start || e.block, e.subject].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  list.push(e);
}

// Week grids: rows = times or blocks, columns = days.
function scrapeGrid() {
  const out = [], seen = new Set();
  document.querySelectorAll('table').forEach((table) => {
    const rows = [...table.rows];
    const isHead = (c) => dayFromText(c.innerText) >= 0 && c.innerText.trim().length < 40;
    const headIdx = rows.findIndex((r) => [...r.cells].filter(isHead).length >= 2);
    if (headIdx < 0) return;
    const dayCols = [];
    [...rows[headIdx].cells].forEach((c, i) => { if (isHead(c)) dayCols[i] = dayFromText(c.innerText); });
    rows.slice(headIdx + 1).forEach((r) => {
      const cells = [...r.cells];
      if (!cells.length) return;
      const labelRange = parseRange(cells[0].innerText);
      const labelBlock = blockLabel(cells[0].innerText);
      cells.forEach((c, i) => {
        if (i === 0 || dayCols[i] === undefined) return;
        const txt = (c.innerText || '').trim();
        if (!txt || /^[-–—.]+$/.test(txt)) return;
        const range = parseRange(txt) || labelRange;
        const blk = blockLabel(txt) || labelBlock;
        if (!range && !blk) return;
        const own = parseRange(txt), ownBlk = blockLabel(txt);
        const { subject, room } = subjectRoom(cleanLines(txt, [own && own.raw, ownBlk && ownBlk.raw]));
        addEntry(out, seen, {
          day: dayCols[i], subject, room,
          ...(range ? { start: range.start, end: range.end } : {}),
          ...(blk ? { block: blk.label } : {}),
        });
      });
    });
  });
  return out;
}

function climb(el, countRe) {
  let card = el;
  while (card.parentElement && card.parentElement !== document.body) {
    const p = card.parentElement, pt = p.innerText || '';
    if (pt.length > 250 || (pt.match(countRe) || []).length !== 1) break;
    card = p;
  }
  return card;
}

function deepest(re) {
  const hits = [];
  document.body.querySelectorAll('*').forEach((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;
    const t = el.textContent || '';
    if (t.length > 400 || !re.test(t)) return;
    for (const c of el.children) if (re.test(c.textContent || '')) return;
    hits.push(el);
  });
  return hits;
}

// Cards/lists that show a time range (time-based view) or a block label (block-based view).
function scrapeCards() {
  const out = [], seen = new Set();
  let guessed = 0;
  const handle = (card) => {
    const range = parseRange(card.innerText), blk = blockLabel(card.innerText);
    if (!range && !blk) return;
    const { subject, room } = subjectRoom(cleanLines(card.innerText, [range && range.raw, blk && blk.raw]));
    let day = findDay(card);
    if (day < 0) { day = new Date().getDay(); guessed++; }
    addEntry(out, seen, {
      day, subject, room,
      ...(range ? { start: range.start, end: range.end } : {}),
      ...(blk ? { block: blk.label } : {}),
    });
  };
  deepest(TIME_RE).forEach((el) => handle(climb(el, TIME_RE_G)));
  if (!out.length) deepest(BLOCK_RE).forEach((el) => handle(climb(el, BLOCK_RE_G)));
  return { entries: out, guessed };
}


const ROOM_STRICT = /^[A-Z]{1,4}\d{1,2}(?:\.\d{1,2})?[A-Za-z]?$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Every element that directly holds text, with its on-screen position.
function leaves() {
  const out = [];
  document.body.querySelectorAll('*').forEach((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(el.tagName.toUpperCase()) || el.closest('[data-ct]')) return;
    let txt = '';
    el.childNodes.forEach((n) => { if (n.nodeType === 3) txt += n.nodeValue; });
    txt = txt.replace(/\s+/g, ' ').trim();
    if (!txt) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({ txt, top: r.top, left: r.left, right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  });
  return out;
}

// Date (YYYY-MM-DD) of the Monday of the week containing the given day-of-month + weekday, nearest to today.
function mondayISO(dayNum, wd, monthIdx) {
  const now = new Date();
  let best = null;
  for (let off = -12; off <= 12; off++) {
    const base = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const d = new Date(base.getFullYear(), base.getMonth(), dayNum);
    if (d.getMonth() !== base.getMonth() || d.getDay() !== wd) continue;
    if (monthIdx !== undefined && d.getMonth() !== monthIdx) continue;
    const dist = Math.abs(d - now);
    if (!best || dist < best.dist) best = { d, dist };
  }
  if (!best) return '';
  const m = new Date(best.d.getFullYear(), best.d.getMonth(), best.d.getDate() - ((wd + 6) % 7));
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

// Finds the day columns, the A/B week letter and the week's date, for both portal views.
function headerInfo(L) {
  const A = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+(\d{1,2})\s+([A-Za-z]{3,})/i;
  const heads = L.filter((l) => l.txt.length < 40 && A.test(l.txt)).sort((a, b) => a.cx - b.cx);
  if (new Set(heads.map((h) => dayFromText(h.txt))).size >= 2) {            // "Mon 12 Oct (MonA)"
    const byDay = new Map();
    heads.forEach((h) => { const d = dayFromText(h.txt); if (!byDay.has(d)) byDay.set(d, h); });
    const cols = [...byDay].map(([day, h]) => ({ day, cx: h.cx, bottom: h.bottom }));
    const first = [...byDay.values()][0], m = first.txt.match(A);
    const wk = (first.txt.match(/\(\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)([A-Z])\s*\)/) || [])[1] || '';
    const mi = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
    return { cols, week: wk, monday: mondayISO(Number(m[2]), dayFromText(first.txt), mi >= 0 ? mi : undefined), headLeaves: heads, headBottom: Math.max(...cols.map((c) => c.bottom)) };
  }
  const names = L.filter((l) => /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/i.test(l.txt));   // "MON" "19" "MonB"
  if (names.length < 2) return null;
  const minTop = Math.min(...names.map((n) => n.top));
  const band = names.filter((n) => n.top < minTop + 40).sort((a, b) => a.left - b.left);
  if (new Set(band.map((n) => n.txt.toLowerCase())).size < 2) return null;
  const cols = [], headLeaves = [];
  let week = '', monday = '';
  band.forEach((n, i) => {
    const next = band[i + 1];
    const group = L.filter((l) => Math.abs(l.cy - n.cy) < 14 && l.left >= n.left - 2 && (!next || l.left < next.left - 2) && l.left < n.left + 400);
    cols.push({
      day: dayFromText(n.txt),
      cx: (Math.min(...group.map((l) => l.left)) + Math.max(...group.map((l) => l.right))) / 2,
      bottom: Math.max(...group.map((l) => l.bottom)),
    });
    headLeaves.push(...group);
    const w = group.find((l) => /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)([A-Z])$/.test(l.txt));
    if (w && !week) week = w.txt.slice(-1);
    const dn = group.find((l) => /^\d{1,2}$/.test(l.txt));
    if (dn && !monday) monday = mondayISO(Number(dn.txt), dayFromText(n.txt));
  });
  return { cols, week, monday, headLeaves, headBottom: Math.max(...cols.map((c) => c.bottom)) };
}

// Splits the leaf texts of a class card (after the title) into teacher and room.
function teacherRoom(rest) {
  const usable = rest.filter((l) => !/\d{1,2}[:.]\d{2}/.test(l.txt) && !/^(to|am|pm)$/i.test(l.txt));
  let room = '', roomOrig = null, partial = '';
  const exact = usable.find((l) => ROOM_STRICT.test(l.txt));
  if (exact) { room = exact.txt; roomOrig = exact; }
  else {
    for (const l of usable) {
      const tok = l.txt.split(' ').pop();
      if (ROOM_STRICT.test(tok)) { room = tok; roomOrig = l; partial = l.txt.slice(0, -tok.length).trim(); break; }
    }
  }
  const cands = usable.filter((l) => l !== roomOrig);
  return { teacher: cands.length ? cands[0].txt : partial, room };
}

const fmtBlock = (t) => (/^\d{1,2}$/.test(t) ? `Block ${t}` : t);

// Time-based view: each class is a box showing "8:50 AM to 10:05 AM", a title, a block badge, teacher and room.
function scrapeTimeCards(L, colOf) {
  const out = [], seen = new Set();
  deepest(TIME_RE).forEach((el) => {
    const card = climb(el, TIME_RE_G);
    const r = card.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    const col = colOf((r.left + r.right) / 2);
    const range = parseRange(card.innerText);
    if (!col || !range) return;
    const inside = L.filter((l) => l.cx >= r.left && l.cx <= r.right && l.top >= r.top - 2 && l.bottom <= r.bottom + 2)
      .sort((a, b) => Math.round(a.top / 8) - Math.round(b.top / 8) || a.left - b.left);
    if (!inside.length) return;
    const title = inside[0];
    const subject = title.txt.replace(/\s*Yr\s*\d+\s*$/i, '').trim();
    if (!subject) return;
    const badge = inside.find((l) => l !== title && /^(\d{1,2}|HR)$/i.test(l.txt) && l.cx > r.left + r.width * 0.6);
    const rest = inside.filter((l) => l !== title && l !== badge);
    const { teacher, room } = teacherRoom(rest);
    addEntry(out, seen, {
      day: col.day, subject, room, teacher, start: range.start, end: range.end,
      ...(badge ? { block: fmtBlock(badge.txt.toUpperCase()) } : {}),
    });
  });
  return out;
}

// Block-based view: rows are blocks (labels on the left), columns are days.
function scrapeBlockRows(L, hi, colOf, left) {
  const { headBottom: hb, headLeaves } = hi;
  const headBottom = hb - 2;
  const isLabel = (t) => t.length <= 30 && (/^(?:\d{1,2}|[A-Za-z]{1,3}\d?)$/.test(t) || TIME_RE.test(t));
  const labels = L.filter((l) => l.cx < left && l.top > headBottom && isLabel(l.txt)).sort((a, b) => a.top - b.top);
  if (!labels.length) return [];
  const groups = new Map();
  L.forEach((l) => {
    if (l.top <= headBottom || labels.includes(l) || headLeaves.includes(l)) return;
    const col = colOf(l.cx);
    if (!col) return;
    let ri = -1;
    labels.forEach((lab, i) => { if (lab.top <= l.top + 10) ri = i; });
    if (ri < 0) return;
    const k = `${ri}|${col.day}`;
    if (!groups.has(k)) groups.set(k, { ri, day: col.day, items: [] });
    groups.get(k).items.push(l);
  });
  const out = [], seen = new Set();
  groups.forEach(({ ri, day, items }) => {
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    const subject = items[0].txt.replace(/\s*Yr\s*\d+\s*$/i, '').trim();
    if (!subject) return;
    const { teacher, room } = teacherRoom(items.slice(1));
    const lab = labels[ri].txt, range = parseRange(lab);
    const entry = { day, subject, room, teacher };
    if (range) { entry.start = range.start; entry.end = range.end; } else entry.block = fmtBlock(lab);
    addEntry(out, seen, entry);
  });
  return out;
}

function scrapeGeometry() {
  const L = leaves();
  const hi = headerInfo(L);
  if (!hi) return null;
  const cols = hi.cols.sort((a, b) => a.cx - b.cx);
  if (cols.length < 2) return null;
  const gaps = cols.slice(1).map((c, i) => c.cx - cols[i].cx).sort((a, b) => a - b);
  const sp = gaps[Math.floor(gaps.length / 2)];
  const left = cols[0].cx - sp / 2, right = cols[cols.length - 1].cx + sp / 2;
  const colOf = (x) => (x < left || x > right ? null
    : cols.reduce((best, c) => (Math.abs(c.cx - x) < Math.abs(best.cx - x) ? c : best), cols[0]));
  let entries = scrapeTimeCards(L, colOf);
  if (!entries.length) entries = scrapeBlockRows(L, hi, colOf, left);
  return entries.length ? { entries, week: hi.week, monday: hi.monday } : null;
}

function scrapeAll() {
  const geo = scrapeGeometry();
  if (geo) return { entries: geo.entries, guessed: 0, week: geo.week, monday: geo.monday };
  const grid = scrapeGrid();
  if (grid.length) return { entries: grid, guessed: 0 };
  return scrapeCards();
}

// Hidden background window used by auto-sync: wait for the timetable to render, then send it.
function autoLoop() {
  let last = -1, stable = 0, clicked = false;
  const t0 = Date.now();
  const timer = setInterval(() => {
    const el = Date.now() - t0;
    const { entries, guessed, week, monday } = scrapeAll();
    if (entries.length && guessed === 0) {
      stable = entries.length === last ? stable + 1 : 0;
      last = entries.length;
      if (stable >= 2) {
        clearInterval(timer);
        ipcRenderer.send('auto-result', { entries, meta: { week: week || '', monday: monday || '', url: location.href } });
      }
      return;
    }
    const isLogin = /login|signin|auth/i.test(location.pathname) || document.querySelector('input[type=email],input[type=password]');
    if (isLogin && el > 3000) { clearInterval(timer); ipcRenderer.send('auto-fail', 'login'); return; }
    if (!clicked && el > 7000) {
      clicked = true;
      const c = [...document.querySelectorAll('a,button,[role=tab],[role=button]')]
        .find((n) => /timetable/i.test(n.textContent || '') && (n.textContent || '').length < 30);
      if (c) c.click();
    }
  }, 1000);
}

window.addEventListener('DOMContentLoaded', async () => {
  const mode = await ipcRenderer.invoke('portal-mode');
  if (mode === 'auto') { autoLoop(); return; }
  const bar = document.createElement('div');
  bar.setAttribute('data-ct', '1');
  bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;gap:8px;font:600 13px system-ui';
  const mk = (label, bg) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `padding:10px 14px;border:0;border-radius:10px;color:#fff;background:${bg};cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)`;
    return b;
  };
  const flash = (b, text, label) => { b.textContent = text; setTimeout(() => (b.textContent = label), 4500); };

  const link = mk('🔗 Open magic link from clipboard', '#2e9e6b');
  link.onclick = async () => {
    const r = await ipcRenderer.invoke('open-clipboard-link');
    const msg = { 'no-link': 'Clipboard has no link — right-click the email button, Copy Link', 'wrong-site': "That link isn't an Atlantis link" }[r];
    if (msg) flash(link, msg, '🔗 Open magic link from clipboard');
  };
  const imp = mk('⏱ Import timetable from this page', '#5b6cff');
  imp.onclick = () => {
    const { entries, guessed, week, monday } = scrapeAll();
    const label = '⏱ Import timetable from this page';
    if (!entries.length) return flash(imp, 'No classes found on this page — open your timetable first', label);
    ipcRenderer.send('import-entries', { entries, meta: { week: week || '', monday: monday || '', url: location.href } });
    const noTime = entries.filter((e) => !e.start).length;
    flash(imp, `Imported ${entries.length} classes${week ? ' (Week ' + week + ')' : ''} ✓` + (noTime ? ' — import the Time-based view too for class times' : '') + (guessed ? ` (${guessed} day guessed)` : ''), label);
  };
  const dbg = mk('Copy page HTML', '#444');
  dbg.onclick = () => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,svg,img,input[type=password]').forEach((n) => n.remove());
    ipcRenderer.send('copy-html', clone.innerHTML.slice(0, 120000));
    flash(dbg, 'Copied ✓', 'Copy page HTML');
  };
  bar.append(link, imp, dbg);
  document.documentElement.append(bar);
});

if (process.env.CT_TEST) require('electron').contextBridge.exposeInMainWorld('__scrape', () => scrapeAll());
