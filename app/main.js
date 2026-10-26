const { app, BrowserWindow, ipcMain, screen, clipboard, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

let win;
function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 300, height: 190, x: width - 330, y: 30,
    frame: false, transparent: true, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: false, title: 'Class Timer',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
}

const STYLES = [['card', 'Card'], ['pill', 'Pill'], ['ring', 'Progress ring'], ['timeline', 'Day timeline'], ['color', 'Colour card'], ['agenda', 'Agenda'], ['bar', 'Progress bar'], ['flip', 'Flip clock'], ['float', 'Floating text'], ['light', 'Light card'], ['custom', 'Custom'], ['desktop', 'Desktop widget'], ['menubar', 'Menu bar']];
let tray = null, style = 'card';
let st = { title: '⏱', l1: 'No class right now', l2: '' };
const isMac = process.platform === 'darwin';

function buildMenu() {
  const radio = (label, id) => ({ label, type: 'radio', checked: style === id, click: () => setStyle(id) });
  return Menu.buildFromTemplate([
    { label: st.l1, enabled: false },
    { label: st.l2, enabled: false },
    { type: 'separator' },
    { label: 'Show window', click: () => setStyle('card') },
    { label: 'Style', submenu: STYLES.map(([id, l]) => radio(l, id)) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}
let desk = null;
function deskFile() { return path.join(app.getPath('userData'), 'desk-pos.json'); }
function ensureDesk() {
  if (desk && !desk.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  let pos = { x: wa.x + wa.width - 360, y: wa.y + 16 };
  try { const p = JSON.parse(fs.readFileSync(deskFile(), 'utf8')); if (Number.isFinite(p.x) && Number.isFinite(p.y)) pos = p; } catch {}
  desk = new BrowserWindow({
    width: 340, height: 184, x: pos.x, y: pos.y, frame: false, transparent: true, resizable: false, hasShadow: false,
    skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'desk-preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  desk.setAlwaysOnTop(true, 'normal', -1);          // above the wallpaper and icons, below every normal window
  desk.setVisibleOnAllWorkspaces(true);
  desk.loadFile('desk.html');
  desk.on('moved', () => { const b = desk.getBounds(); try { fs.writeFileSync(deskFile(), JSON.stringify({ x: b.x, y: b.y })); } catch {} });
}
function applyMode() {
  if (!win || win.isDestroyed()) return;
  if (style !== 'menubar' && tray) { tray.destroy(); tray = null; }
  if (style !== 'desktop' && desk && !desk.isDestroyed()) desk.hide();
  if (style === 'menubar') {
    if (!tray) tray = new Tray(nativeImage.createEmpty());
    try { tray.setTitle(st.title, { fontType: 'monospacedDigit' }); } catch { tray.setTitle(st.title); }
    tray.setContextMenu(buildMenu());
    win.hide();
    if (isMac) app.dock.hide();
  } else if (style === 'desktop') {
    ensureDesk();
    desk.showInactive();
    win.hide();
    if (isMac) app.dock.show();
  } else {
    if (isMac) app.dock.show();
    win.show();
  }
}
function setStyle(s) {
  style = s;
  if (win && !win.isDestroyed()) win.webContents.send('set-style', s);
  applyMode();
}
ipcMain.on('mode', (_e, s) => { if (s !== style || (s === 'menubar' && !tray)) { style = s; applyMode(); } });
ipcMain.on('status', (_e, s) => {
  const menuChanged = s.l1 !== st.l1 || s.l2 !== st.l2;
  const titleChanged = s.title !== st.title;
  st = { title: s.title, l1: s.l1, l2: s.l2 };
  if (tray) {
    if (titleChanged) { try { tray.setTitle(st.title, { fontType: 'monospacedDigit' }); } catch { tray.setTitle(st.title); } }
    if (menuChanged) tray.setContextMenu(buildMenu());
  }
  if (style === 'desktop' && desk && !desk.isDestroyed() && s.desk) desk.webContents.send('desk-state', s.desk);
});
ipcMain.on('desk-menu', () => { if (desk && !desk.isDestroyed()) buildMenu().popup({ window: desk }); });
// clicking the Dock icon while in desktop/menu-bar mode brings the normal window back
app.on('activate', () => { if (style === 'desktop' || style === 'menubar') setStyle('card'); });

// ---- share the timetable with the macOS widget (a small file the widget reads) ----
ipcMain.handle('widget-export', (_e, json, poke) => {
  try {
    const file = path.join(app.getPath('userData'), 'widget-timetable.json'), tmp = file + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, String(json));
    fs.renameSync(tmp, file);
    // nudge the widget so it re-reads the file right away (harmless if it isn't running)
    if (poke && process.platform === 'darwin') {
      try { require('child_process').execFile('killall', ['ClassTimerWidget'], () => {}); } catch (e) { /* ignore */ }
    }
    return { ok: true, at: Date.now(), file };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.on('resize', (_e, h, w) => {
  if (!win || win.isDestroyed()) return;
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  win.setContentSize(w || 300, Math.min(Math.ceil(h), wa.height - 20));
  // if growing pushed the bottom off the screen, slide the window back up
  const b = win.getBounds();
  if (b.y + b.height > wa.y + wa.height) win.setPosition(b.x, Math.max(wa.y, wa.y + wa.height - b.height - 10));
});
let prevBounds = null;
ipcMain.on('designer', (_e, on) => {
  if (!win || win.isDestroyed()) return;
  if (on) {
    prevBounds = win.getBounds();
    const wa = screen.getDisplayMatching(prevBounds).workArea;
    const w = Math.min(920, wa.width - 40), h = Math.min(660, wa.height - 40);
    win.setContentSize(w, h);
    win.setPosition(Math.round(wa.x + (wa.width - w) / 2), Math.round(wa.y + (wa.height - h) / 2));
  } else if (prevBounds) {
    win.setPosition(prevBounds.x, prevBounds.y);
    win.setContentSize(prevBounds.width, prevBounds.height);
    prevBounds = null;
  }
});
ipcMain.on('pin', (_e, on) => win && win.setAlwaysOnTop(on, 'floating'));
let portal;
function openPortal() {
  if (portal && !portal.isDestroyed()) { portal.show(); portal.focus(); return; }
  portal = new BrowserWindow({
    width: 1100, height: 800, title: 'Atlantis — log in and open your timetable',
    webPreferences: {
      partition: 'persist:atlantis', // keeps you logged in between launches
      preload: path.join(__dirname, 'portal-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  portal.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/a2\.atlantis\.education\//.test(url)) portal.loadURL(url);
    else shell.openExternal(url);
    return { action: 'deny' };
  });
  portal.loadURL('https://a2.atlantis.education/');
}
ipcMain.on('open-portal', openPortal);

// ---- auto-sync: a hidden window reads the timetable using the saved login ----
let syncWin = null, syncTimer = null;
function reportSync(r) { if (win && !win.isDestroyed()) win.webContents.send('sync-status', { ...r, at: Date.now() }); }
function endSync(r, payload) {
  clearTimeout(syncTimer);
  if (syncWin && !syncWin.isDestroyed()) syncWin.destroy();
  syncWin = null;
  if (payload && win && !win.isDestroyed()) win.webContents.send('import-entries', payload);
  reportSync(r);
}
function runSync(url) {
  if (syncWin && !syncWin.isDestroyed()) return;
  let u;
  try { u = new URL(url); } catch { return reportSync({ ok: false, reason: 'nourl' }); }
  if (u.protocol !== 'https:' || !/(^|\.)atlantis\.education$/.test(u.hostname)) return reportSync({ ok: false, reason: 'nourl' });
  syncWin = new BrowserWindow({
    show: false, width: 1500, height: 950,
    webPreferences: {
      partition: 'persist:atlantis', preload: path.join(__dirname, 'portal-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
    },
  });
  syncTimer = setTimeout(() => endSync({ ok: false, reason: 'timeout' }), 45000);
  syncWin.loadURL(url).catch(() => endSync({ ok: false, reason: 'load' }));
}
ipcMain.on('sync', (_e, url) => runSync(url));
ipcMain.handle('portal-mode', (e) => (syncWin && !syncWin.isDestroyed() && e.sender === syncWin.webContents ? 'auto' : 'manual'));
ipcMain.on('auto-result', (e, payload) => {
  if (!syncWin || syncWin.isDestroyed() || e.sender !== syncWin.webContents) return;
  endSync({ ok: true, count: payload.entries.length, week: payload.meta.week }, payload);
});
ipcMain.on('auto-fail', (e, reason) => {
  if (!syncWin || syncWin.isDestroyed() || e.sender !== syncWin.webContents) return;
  endSync({ ok: false, reason: String(reason) });
});
// ---- notifications: our own banner (always works) + optional macOS notification ----
let banner = null, bannerTimer = null;
function hideBanner() { clearTimeout(bannerTimer); if (banner && !banner.isDestroyed()) banner.hide(); }
function showBanner(n) {
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.round(workArea.x + (workArea.width - 360) / 2), y = workArea.y + 8;
  if (!banner || banner.isDestroyed()) {
    banner = new BrowserWindow({
      width: 360, height: 100, x, y, frame: false, transparent: true, resizable: false, hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'banner-preload.js'), contextIsolation: true },
    });
    banner.setAlwaysOnTop(true, 'screen-saver');
    banner.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    banner.loadFile('banner.html');
  }
  const push = () => {
    banner.setPosition(x, y);
    banner.webContents.executeJavaScript(`show(${JSON.stringify({ title: n.title, body: n.body, theme: n.theme })})`).catch(() => {});
    banner.showInactive();
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideBanner, 9000);
  };
  if (banner.webContents.isLoading()) banner.webContents.once('did-finish-load', push); else push();
}
ipcMain.on('banner-dismiss', hideBanner);

const liveNotes = new Set();   // keep references so macOS doesn't drop later notifications
ipcMain.on('notify', (_e, n) => {
  const title = String(n.title || ''), body = String(n.body || '');
  if (n.banner !== false) showBanner({ title, body, theme: n.theme });
  if (n.sound !== false && isMac) execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
  if (n.native && Notification.isSupported()) {
    const note = new Notification({ title, body });
    liveNotes.add(note);
    const forget = () => liveNotes.delete(note);
    note.on('close', forget); note.on('click', forget); note.on('failed', forget);
    setTimeout(forget, 5 * 60 * 1000);
    note.show();
  }
});
ipcMain.on('import-entries', (e, entries) => {
  if (portal && e.sender !== portal.webContents) return;
  if (win && !win.isDestroyed()) win.webContents.send('import-entries', entries);
});
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// Email security tools (Proofpoint URL Defense, Outlook Safe Links) wrap the real link.
function unwrapLink(raw) {
  let s = (raw.match(/https?:\/\/[^\s<>"']+/) || [''])[0];
  let m = s.match(/^https:\/\/urldefense(?:\.proofpoint)?\.com\/v3\/__(.+?)__;([^!]*)!/i);
  if (m) {
    const list = Buffer.from(m[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    let i = 0;
    return m[1].replace(/\*(\*.)?/g, (_, run) => {
      const ch = list[i++] ?? '*';
      return run ? ch.repeat(B64.indexOf(run[1]) + 2) : ch;
    });
  }
  m = s.match(/^https:\/\/urldefense\.proofpoint\.com\/v2\/url\?(.+)$/i);
  if (m) {
    const u = new URLSearchParams(m[1]).get('u');
    if (u) return decodeURIComponent(u.replace(/-/g, '%').replace(/_/g, '/'));
  }
  m = s.match(/^https:\/\/[a-z0-9.-]*safelinks\.protection\.outlook\.com\/.*[?&]url=([^&]+)/i);
  if (m) return decodeURIComponent(m[1]);
  return s;
}

ipcMain.handle('open-clipboard-link', (e) => {
  if (!portal || e.sender !== portal.webContents) return 'ignored';
  let u;
  try { u = new URL(unwrapLink(clipboard.readText())); } catch { return 'no-link'; }
  if (u.protocol !== 'https:' || !/(^|\.)atlantis\.education$/.test(u.hostname)) return 'wrong-site';
  portal.loadURL(u.toString());
  return 'ok';
});
ipcMain.on('copy-html', (e, html) => {
  if (portal && e.sender === portal.webContents) clipboard.writeText(String(html));
});
ipcMain.on('close', () => app.quit());

app.whenReady().then(() => {
  // websites opened inside the app (the portal) may not ask for camera, location, etc.
  require('electron').session.fromPartition('persist:atlantis').setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
