const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
nativeTheme.themeSource = 'dark';
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

app.setPath('userData', path.join(app.getPath('appData'), 'GameVault')); // сохраняем прежнюю папку с библиотекой
const dataFile = () => path.join(app.getPath('userData'), 'library.json');
const coversDir = () => path.join(app.getPath('userData'), 'covers');
const DEFAULT = { games: [], settings: { minimizeOnLaunch: true } };

function read() {
  try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(dataFile(), 'utf8')) }; }
  catch { return JSON.parse(JSON.stringify(DEFAULT)); }
}
function write(d) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(d, null, 2));
}

const bf = path.join(app.getPath('userData'), 'window.json');
let wb = {}; try { wb = JSON.parse(fs.readFileSync(bf, 'utf8')); } catch {}
let win;
function createWindow() {
  win = new BrowserWindow({
    width: wb.width || 1280, height: wb.height || 800, x: wb.x, y: wb.y, minWidth: 900, minHeight: 600,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b0d1c', symbolColor: '#e8eaff', height: 36 },
    backgroundColor: '#0b0d1c', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  if (wb.max) win.maximize();
  win.on('close', () => { try { fs.writeFileSync(bf, JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch {} });
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { createWindow(); win.webContents.once('did-finish-load', () => setTimeout(initUpdater, 2000)); });
  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('lib:load', () => read());
ipcMain.handle('lib:save', (_, d) => { write(d); return true; });

ipcMain.handle('pick:exe', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выберите файл запуска игры',
    properties: ['openFile'],
    filters: [{ name: 'Игры и ярлыки', extensions: ['exe', 'lnk', 'bat', 'url'] }, { name: 'Все файлы', extensions: ['*'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('pick:cover', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выберите обложку', properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (r.canceled) return null;
  fs.mkdirSync(coversDir(), { recursive: true });
  const dest = path.join(coversDir(), Date.now() + path.extname(r.filePaths[0]));
  fs.copyFileSync(r.filePaths[0], dest);
  return dest;
});

ipcMain.handle('app:openData', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('game:launch', async (_, id) => {
  const d = read();
  const g = d.games.find(x => x.id === id);
  if (!g) return { ok: false, error: 'Игра не найдена' };
  try {
    g.lastPlayed = Date.now();
    write(d);
    // Ссылка лаунчера (steam://, com.epicgames.launcher://) — время игры не считается
    if (/^shell:/i.test(g.path)) {
      spawn('explorer.exe', [g.path], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true, tracked: false };
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(g.path)) {
      await shell.openExternal(g.path);
      return { ok: true, tracked: false };
    }
    if (!fs.existsSync(g.path)) return { ok: false, error: 'Файл не найден: ' + g.path };
    if (!/\.exe$/i.test(g.path)) {
      const err = await shell.openPath(g.path);
      return err ? { ok: false, error: err } : { ok: true, tracked: false };
    }
    const started = Date.now();
    const argv = ((g.args || '').match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ''));
    const child = spawn(g.path, argv, { cwd: path.dirname(g.path), detached: true, stdio: 'ignore' });
    child.on('error', e => win && win.webContents.send('game:error', e.message));
    child.on('exit', () => {
      const sec = Math.round((Date.now() - started) / 1000);
      const cur = read();
      const game = cur.games.find(x => x.id === id);
      if (game && sec >= 20) { game.playtime = (game.playtime || 0) + sec; write(cur); }
      if (win && !win.isDestroyed()) win.webContents.send('lib:changed', { id, sec });
    });
    if (d.settings.minimizeOnLaunch && win) win.minimize();
    return { ok: true, tracked: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---------- автообновление ----------
let updater = null;
const sendUpd = (msg, ready) => { if (win && !win.isDestroyed()) win.webContents.send('upd:status', { msg, ready: !!ready }); };
const NO_UPD = 'Автообновление работает в установленной версии. Скачайте GameVault-Setup.exe со страницы Releases.';
function initUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = true;
    updater.on('checking-for-update', () => sendUpd('Проверяем обновления…'));
    updater.on('update-available', i => sendUpd('Скачиваем версию ' + i.version + '…'));
    updater.on('update-not-available', () => sendUpd('У вас последняя версия'));
    updater.on('update-downloaded', i => sendUpd('Версия ' + i.version + ' готова к установке', true));
    updater.on('error', e => sendUpd('Не удалось проверить обновления: ' + e.message));
    updater.checkForUpdates().catch(() => {});
  } catch (e) { updater = null; }
}
ipcMain.handle('upd:check', async () => {
  if (!updater) return { msg: NO_UPD };
  try { await updater.checkForUpdates(); return {}; } catch (e) { return { msg: e.message }; }
});
ipcMain.handle('upd:install', () => updater && updater.quitAndInstall());
ipcMain.handle('app:version', () => app.getVersion());

// ---------- поиск игр ----------
const reg = args => new Promise(r => execFile('reg', args, { windowsHide: true }, (e, o) => r(e ? '' : o)));
const BAD = /unins|crash|redist|setup|dxsetup|vc_?red|helper|eac|easyanticheat|battleye|prereq|dotnet|cleanup|report/i;

async function steamGames() {
  const out = [];
  const o = await reg(['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
  const m = o.match(/SteamPath\s+REG_SZ\s+(.+)/);
  const root = m ? m[1].trim().replace(/\//g, '\\') : 'C:\\Program Files (x86)\\Steam';
  const libs = new Map();
  const addLib = p => libs.set(path.resolve(p).toLowerCase(), path.resolve(p));
  addLib(root);
  try {
    const v = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const x of v.matchAll(/"path"\s+"([^"]+)"/g)) addLib(x[1].replace(/\\\\/g, '\\'));
  } catch {}
  for (const l of libs.values()) {
    const d = path.join(l, 'steamapps'); let files = [];
    try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const t = fs.readFileSync(path.join(d, f), 'utf8'), id = f.match(/\d+/)[0];
        const n = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
        if (!n || /Steamworks|Proton|Steam Linux Runtime|Redistributable/i.test(n)) continue;
        out.push({ name: n, launcher: 'Steam', path: 'steam://rungameid/' + id,
          cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg` });
      } catch {}
    }
  }
  return out;
}
async function epicGames() {
  let d = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (!fs.existsSync(d)) {
    const o = await reg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', '/v', 'AppDataPath']);
    const m = o.match(/AppDataPath\s+REG_SZ\s+(.+)/); if (m) d = path.join(m[1].trim(), 'Manifests');
  }
  const out = []; let files = [];
  try { files = fs.readdirSync(d); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith('.item')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      if (!j.DisplayName || !j.AppName || !j.LaunchExecutable || j.bIsIncompleteInstall) continue;
      if ((j.AppCategories || []).some(c => /engine|plugin|addons/i.test(c))) continue;
      out.push({ name: j.DisplayName, launcher: 'Epic Games',
        path: `com.epicgames.launcher://apps/${j.CatalogNamespace}%3A${j.CatalogItemId}%3A${j.AppName}?action=launch&silent=true` });
    } catch {}
  }
  return out;
}
async function ubisoftGames() {
  const o = await reg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs', '/s']), out = [];
  for (const b of o.split(/\r?\n\r?\n/)) {
    const id = (b.match(/\\Installs\\(\d+)/) || [])[1], dir = b.match(/InstallDir\s+REG_SZ\s+(.+)/i);
    if (id && dir) out.push({ name: path.basename(dir[1].trim().replace(/[\\/]+$/, '')), launcher: 'Ubisoft Connect', path: `uplay://launch/${id}/0` });
  }
  return out;
}
function riotGames() {
  const out = []; let rc = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
  try { rc = JSON.parse(fs.readFileSync('C:\\ProgramData\\Riot Games\\RiotClientInstalls.json', 'utf8')).rc_default || rc; } catch {}
  if (!fs.existsSync(rc)) return out;
  [['valorant', 'VALORANT'], ['league_of_legends', 'League of Legends'], ['bacon', 'Legends of Runeterra']].forEach(([id, name]) => {
    if (fs.existsSync('C:\\ProgramData\\Riot Games\\Metadata\\' + id + '.live'))
      out.push({ name, launcher: 'Riot Games', path: rc, args: `--launch-product=${id} --launch-patchline=live` });
  });
  return out;
}
function miscGames() {
  const out = [], la = process.env.LOCALAPPDATA || '', pf = process.env['ProgramFiles'] || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const mc = [path.join(pf86, 'Minecraft Launcher', 'MinecraftLauncher.exe'), path.join(pf, 'Minecraft Launcher', 'MinecraftLauncher.exe'), path.join(la, 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe')].find(p => fs.existsSync(p));
  if (mc) out.push({ name: 'Minecraft', launcher: 'Minecraft', path: mc });
  else if (fs.existsSync(path.join(la, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe')))
    out.push({ name: 'Minecraft', launcher: 'Minecraft', path: 'shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft' });
  if (fs.existsSync(path.join(la, 'Roblox', 'Versions'))) out.push({ name: 'Roblox', launcher: 'Roblox', path: 'roblox://' });
  else if (fs.existsSync(path.join(la, 'Packages', 'ROBLOXCORPORATION.ROBLOX_55nm5eh3cm0pr')))
    out.push({ name: 'Roblox', launcher: 'Roblox', path: 'shell:AppsFolder\\ROBLOXCORPORATION.ROBLOX_55nm5eh3cm0pr!App' });
  return out;
}
function driveFolders() {
  const out = [];
  for (const L of 'CDEFGH') for (const [dir, l] of [['Games', 'Другое'], ['XboxGames', 'Xbox'], ['Program Files\\EA Games', 'EA App'], ['Program Files (x86)\\EA Games', 'EA App'], ['Program Files\\Electronic Arts', 'EA App'], ['GOG Games', 'GOG']]) {
    const r = `${L}:\\${dir}`; if (fs.existsSync(r)) out.push(...folderGames(r, l));
  }
  return out;
}
async function gogGames() {
  const o = await reg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', '/s']), out = [];
  for (const b of o.split(/\r?\n\r?\n/)) {
    const n = b.match(/gameName\s+REG_SZ\s+(.+)/i), e = b.match(/\bexe\s+REG_SZ\s+(.+)/i);
    if (n && e) out.push({ name: n[1].trim(), launcher: 'GOG', path: e[1].trim() });
  }
  return out;
}
function findExe(dir, depth = 2) {
  let best = null;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && /\.exe$/i.test(e.name) && !BAD.test(e.name)) {
        const s = fs.statSync(p).size; if (!best || s > best.s) best = { p, s };
      } else if (e.isDirectory() && depth > 0 && !/^(redist|_commonredist|engine|directx)$/i.test(e.name)) {
        const b = findExe(p, depth - 1); if (b && (!best || b.s > best.s)) best = b;
      }
    }
  } catch {}
  return best;
}
function folderGames(root, launcher) {
  const out = [];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const b = findExe(path.join(root, e.name)); if (b) out.push({ name: e.name, launcher, path: b.p });
    }
  } catch {}
  return out;
}
ipcMain.handle('scan:run', async (_, folders) => {
  const all = [...await steamGames(), ...await epicGames(), ...await gogGames(), ...await ubisoftGames(), ...riotGames(), ...miscGames(), ...driveFolders()];
  for (const f of folders || []) all.push(...folderGames(f, 'Другое'));
  const seen = new Set();
  return all.filter(g => {
    const k = g.path.toLowerCase() + '|' + (g.args || ''), n = g.name.toLowerCase();
    if (seen.has(k) || seen.has(n)) return false;
    seen.add(k); seen.add(n); return true;
  });
});

ipcMain.handle('pick:folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Папка с играми', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('ui:titlebar', (_, color, symbolColor) => { try { win.setTitleBarOverlay({ color, symbolColor, height: 36 }); } catch {} });
