const $ = s => document.querySelector(s);
const LAUNCHERS = ['Steam', 'Epic Games', 'GOG', 'EA App', 'Ubisoft Connect', 'Riot Games', 'Battle.net', 'Xbox', 'Minecraft', 'Roblox', 'Другое'];
let db = { games: [], settings: { minimizeOnLaunch: true } };
let view = 'all', q = '', editingId = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileUrl = p => /^(https?:|data:)/i.test(p) ? p : 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/'/g, '%27').replace(/"/g, '%22');
const fmt = s => { if (!s) return 'Не играл'; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} ч ${m} мин` : (m ? `${m} мин` : 'меньше минуты'); };
const hue = n => [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const save = () => api.save(db);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }

function filtered() {
  const list = db.games.filter(g => {
    if (view === 'fav' && !g.favorite) return false;
    if (view.startsWith('cat:') && g.category !== view.slice(4)) return false;
    return !q || (g.name + ' ' + (g.category || '') + ' ' + g.launcher).toLowerCase().includes(q);
  });
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    last: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0),
    time: (a, b) => (b.playtime || 0) - (a.playtime || 0),
    added: (a, b) => (b.added || 0) - (a.added || 0)
  };
  return list.sort(by[$('#sort').value]);
}

function render() {
  const cats = [...new Set(db.games.map(g => g.category).filter(Boolean))].sort();
  let nav = `<button data-v="all" class="${view === 'all' ? 'on' : ''}">Все игры<span>${db.games.length}</span></button>
    <button data-v="fav" class="${view === 'fav' ? 'on' : ''}">Избранное<span>${db.games.filter(g => g.favorite).length}</span></button>`;
  if (cats.length) nav += '<div class="sec">Категории</div>' + cats.map(c => `<button data-v="cat:${esc(c)}" class="${view === 'cat:' + c ? 'on' : ''}">${esc(c)}<span>${db.games.filter(g => g.category === c).length}</span></button>`).join('');
  $('#nav').innerHTML = nav;
  $('#cats').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

  const total = db.games.reduce((a, g) => a + (g.playtime || 0), 0);
  const recent = [...db.games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
  $('#stats').innerHTML = `<div class="stat"><b>${db.games.length}</b><span>игр в библиотеке</span></div>
    <div class="stat"><b>${(total / 3600).toFixed(1)} ч</b><span>общее время игры</span></div>
    <div class="stat"><b>${recent && recent.lastPlayed ? esc(recent.name) : '—'}</b><span>последняя игра</span></div>`;

  const list = filtered();
  $('#grid').innerHTML = list.length ? list.map((g, idx) => {
    const bg = `background:linear-gradient(135deg,hsl(${hue(g.name)} 60% 38%),hsl(${(hue(g.name) + 60) % 360} 65% 24%))`;
    return `<article class="card${running.has(g.id) ? ' run' : ''}" data-id="${g.id}" style="--i:${Math.min(idx, 24)}">
      <div class="cover" style="${bg}">${esc(g.name[0].toUpperCase())}${g.cover ? `<img src="${esc(fileUrl(g.cover))}" data-fb="${esc(fbUrl(g.cover))}" alt="" loading="lazy">` : ''}</div>
      <div class="tools"><button class="fav" data-a="fav" title="Избранное">${g.favorite ? '★' : '☆'}</button><button data-a="edit" title="Изменить">✎</button></div>
      <button class="primary play" data-a="play">Играть</button>
      <div class="info"><b title="${esc(g.name)}">${esc(g.name)}</b><span>${running.has(g.id) ? 'Играете сейчас' : esc(g.launcher) + ' · ' + fmt(g.playtime)}</span></div></article>`;
  }).join('') : `<div class="empty">${db.games.length ? 'Ничего не найдено. Измените запрос или фильтр.' : 'Библиотека пуста. Нажмите «Добавить игру», чтобы начать.'}</div>`;
}

async function reload() { db = await api.load(); normalize(); applyTheme(); render(); }

$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) { view = b.dataset.v; animNext = true; render(); } };
$('#search').oninput = e => { q = e.target.value.trim().toLowerCase(); render(); };
$('#sort').onchange = render;
$('#grid').onclick = async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = b.closest('.card').dataset.id, g = db.games.find(x => x.id === id);
  if (b.dataset.a === 'fav') { g.favorite = !g.favorite; await save(); render(); }
  if (b.dataset.a === 'edit') openForm(g);
  if (b.dataset.a === 'play') {
    const r = await api.launch(id); if (r.ok && r.tracked) running.add(id);
    toast(r.ok ? 'Запускаем: ' + g.name : r.error);
    reload();
  }
};

$('#fLauncher').innerHTML = LAUNCHERS.map(l => `<option>${l}</option>`).join('');
function openForm(g) {
  editingId = g ? g.id : null;
  $('#dlgTitle').textContent = g ? 'Изменить игру' : 'Новая игра';
  $('#fName').value = g?.name || ''; $('#fLauncher').value = g?.launcher || 'Steam';
  $('#fPath').value = g?.path || ''; $('#fArgs').value = g?.args || ''; $('#fCover').value = g?.cover || '';
  $('#fCat').value = g?.category || ''; $('#fFav').checked = !!g?.favorite;
  $('#btnDel').style.display = g ? '' : 'none';
  $('#dlg').showModal();
}
$('#btnAdd').onclick = () => openForm(null);
$('#btnCancel').onclick = () => $('#dlg').close();
$('#pickExe').onclick = async () => {
  const p = await api.pickExe(); if (!p) return;
  $('#fPath').value = p;
  if (!$('#fName').value) $('#fName').value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
};
$('#pickCover').onclick = async () => { const p = await api.pickCover(); if (p) $('#fCover').value = p; };
$('#form').onsubmit = async e => {
  e.preventDefault();
  const data = { name: $('#fName').value.trim(), launcher: $('#fLauncher').value, path: $('#fPath').value.trim(), args: $('#fArgs').value.trim(), cover: $('#fCover').value.trim(), category: $('#fCat').value.trim(), favorite: $('#fFav').checked };
  if (editingId) Object.assign(db.games.find(x => x.id === editingId), data);
  else db.games.push({ id: crypto.randomUUID(), added: Date.now(), playtime: 0, lastPlayed: 0, ...data });
  await save(); $('#dlg').close(); render(); toast('Сохранено');
};
$('#btnDel').onclick = async () => {
  if (!confirm('Удалить игру из библиотеки? Файлы игры останутся на диске.')) return;
  db.games = db.games.filter(x => x.id !== editingId);
  await save(); $('#dlg').close(); render(); toast('Удалено');
};

$('#btnSettings').onclick = () => { $('#sMin').checked = !!db.settings.minimizeOnLaunch; $('#dlgSet').showModal(); };
$('#sMin').onchange = e => { db.settings.minimizeOnLaunch = e.target.checked; save(); };
$('#sData').onclick = () => api.openData();
$('#sClose').onclick = () => $('#dlgSet').close();

api.onChanged(p => { running.delete(p.id); reload(); if (p.sec >= 20) toast('Сессия закончилась: ' + fmt(p.sec)); });
api.onError(m => toast('Ошибка запуска: ' + m));

// ---------- тема, эффекты, кастомизация ----------
const PRESETS = {
  'Индиго': { bg: '#0b0d1c', s1: '#12152e', s2: '#1a1e41', line: '#2a2f66', text: '#e8eaff', mut: '#8b90c4', a: '#5b7cff', b: '#8b5cf6' },
  'Неон': { bg: '#07050f', s1: '#100b22', s2: '#1a1236', line: '#3a2670', text: '#f1eaff', mut: '#a58fd6', a: '#00e5ff', b: '#ff2bd6' },
  'Кровь': { bg: '#0d0506', s1: '#1a0a0c', s2: '#261014', line: '#4a1a22', text: '#ffecee', mut: '#c98a92', a: '#ff2d3d', b: '#ff7a1a' },
  'Океан': { bg: '#050f1a', s1: '#0a1b2e', s2: '#112a44', line: '#1d4670', text: '#e6f4ff', mut: '#86b0d4', a: '#19a7ff', b: '#19e0c8' },
  'Малина': { bg: '#140b14', s1: '#201220', s2: '#2e1a2e', line: '#4d2a4d', text: '#ffe8f3', mut: '#c48bab', a: '#ff4d8d', b: '#ff8a4d' },
  'Изумруд': { bg: '#08140f', s1: '#0f211a', s2: '#163026', line: '#235040', text: '#e6fff3', mut: '#85c4a6', a: '#2ecc8f', b: '#2bb5d8' },
  'Закат': { bg: '#150d08', s1: '#22150d', s2: '#321f12', line: '#59351d', text: '#fff0e4', mut: '#c49a7a', a: '#ff8a3d', b: '#ff4d6d' },
  'Графит': { bg: '#0e0e10', s1: '#17171a', s2: '#222226', line: '#34343a', text: '#ececf0', mut: '#8f8f99', a: '#9aa4b8', b: '#6c7a99' },
  'AMOLED': { bg: '#000000', s1: '#0a0a0a', s2: '#141414', line: '#262626', text: '#f2f2f2', mut: '#8a8a8a', a: '#8b5cf6', b: '#5b7cff' },
  'Светлая': { bg: '#f1f3fb', s1: '#ffffff', s2: '#e7eaf7', line: '#ccd2ea', text: '#161a33', mut: '#5d6590', a: '#4f6bff', b: '#8b5cf6' }
};
const DEFT = { preset: 'Индиго', a: null, b: null, bgc: null, size: 170, rad: 12, blur: 8, bgOp: 30, font: '"Segoe UI Variable"', glass: true, anim: true, list: false, bgImage: '', style: 'classic', scale: 100, level: 60,
  fx: { aurora: true, particles: false, spot: true, tilt: true, glow: true, shine: true, enter: true } };
let animNext = true; const running = new Set();
const fbUrl = c => /library_600x900/.test(c) ? c.replace('library_600x900.jpg', 'header.jpg') : '';
$('#grid').addEventListener('error', e => {
  const i = e.target; if (i.tagName !== 'IMG') return;
  if (i.dataset.fb && !i.dataset.tried) { i.dataset.tried = 1; i.src = i.dataset.fb; } else i.remove();
}, true);
function normalize() {
  const seen = new Set(), before = db.games.length;
  db.games = db.games.filter(g => { const k = (g.path + '|' + (g.args || '')).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (db.games.length !== before) save();
  db.settings = { minimizeOnLaunch: true, folders: [], ...db.settings };
  const old = db.settings.theme || {};
  db.settings.theme = { ...DEFT, ...old, fx: { ...DEFT.fx, ...(old.fx || {}) } };
}
const cv = $('#fxc'), cx = cv.getContext('2d'); let raf = 0, pkey = '';
function particles(on, col) {
  const key = on + col + innerWidth + 'x' + innerHeight; if (key === pkey) return; pkey = key;
  cancelAnimationFrame(raf); cx.clearRect(0, 0, cv.width, cv.height); if (!on) return;
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const pts = Array.from({ length: Math.round(W * H / 24000) }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4 }));
  (function loop() {
    if (!document.hidden) {
      cx.clearRect(0, 0, W, H); cx.fillStyle = cx.strokeStyle = col;
      for (const p of pts) { p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H; cx.globalAlpha = .6; cx.fillRect(p.x, p.y, 2, 2); }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = dx * dx + dy * dy;
        if (d < 14000) { cx.globalAlpha = (1 - d / 14000) * .28; cx.beginPath(); cx.moveTo(pts[i].x, pts[i].y); cx.lineTo(pts[j].x, pts[j].y); cx.stroke(); }
      }
    }
    raf = requestAnimationFrame(loop);
  })();
}
const preset = () => PRESETS[db.settings.theme.preset] || PRESETS['Индиго'];
addEventListener('resize', () => { const t = db.settings.theme; particles(t.fx.particles, t.a || preset().a); });
function applyTheme() {
  const t = db.settings.theme, p = preset(), st = document.documentElement.style, bg = t.bgc || p.bg;
  const v = { '--bg': bg, '--s1': p.s1, '--s2': p.s2, '--line': p.line, '--text': p.text, '--mut': p.mut, '--blue': t.a || p.a, '--vio': t.b || p.b, '--card': t.size + 'px', '--r': t.rad + 'px', '--blur': t.blur + 'px', '--bgop': t.bgOp / 100, '--lvl': t.level / 100, '--font': t.font };
  for (const k in v) st.setProperty(k, v[k]);
  $('#bg').style.backgroundImage = t.bgImage ? `url("${fileUrl(t.bgImage)}")` : 'none';
  document.body.classList.toggle('glass', !!t.glass);
  document.body.classList.toggle('noanim', !t.anim);
  for (const k in t.fx) document.body.classList.toggle('fx-' + k, !!t.fx[k]);
  $('#grid').classList.toggle('list', !!t.list);
  $('#grid').classList.toggle('poster', t.style === 'poster');
  api.zoom(t.scale / 100); api.titlebar(bg, p.text);
  particles(t.fx.particles, t.a || p.a);
}
function syncSettings() {
  const t = db.settings.theme, p = preset();
  $('#presets').innerHTML = Object.keys(PRESETS).map(n => `<button data-p="${n}" class="${t.preset === n ? 'on' : ''}">${n}</button>`).join('');
  $('#tA').value = t.a || p.a; $('#tB').value = t.b || p.b; $('#tBg').value = t.bgc || p.bg;
  for (const [id, k] of [['tSize', 'size'], ['tRad', 'rad'], ['tBlur', 'blur'], ['tBgOp', 'bgOp'], ['tScale', 'scale'], ['tLevel', 'level'], ['tFont', 'font'], ['tStyle', 'style']]) $('#' + id).value = t[k];
  $('#tGlass').checked = t.glass; $('#tAnim').checked = t.anim; $('#tList').checked = t.list;
  document.querySelectorAll('[data-fx]').forEach(i => i.checked = !!t.fx[i.dataset.fx]);
  $('#sMin').checked = !!db.settings.minimizeOnLaunch;
  $('#folders').innerHTML = db.settings.folders.map((f, i) => `<div class="folder"><span>${esc(f)}</span><button data-i="${i}" title="Убрать">✕</button></div>`).join('');
}
const setTheme = patch => { Object.assign(db.settings.theme, patch); applyTheme(); render(); save(); };
$('#btnSettings').onclick = () => { syncSettings(); $('#dlgSet').showModal(); };
document.querySelector('.tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.p !== b.dataset.t);
};
$('#presets').onclick = e => { const b = e.target.closest('button'); if (b) { setTheme({ preset: b.dataset.p, a: null, b: null, bgc: null }); syncSettings(); } };
for (const [id, k, num] of [['tA', 'a'], ['tB', 'b'], ['tBg', 'bgc'], ['tSize', 'size', 1], ['tRad', 'rad', 1], ['tBlur', 'blur', 1], ['tBgOp', 'bgOp', 1], ['tScale', 'scale', 1], ['tLevel', 'level', 1]])
  $('#' + id).oninput = e => setTheme({ [k]: num ? +e.target.value : e.target.value });
$('#tFont').onchange = e => setTheme({ font: e.target.value });
$('#tStyle').onchange = e => setTheme({ style: e.target.value });
$('#tGlass').onchange = e => setTheme({ glass: e.target.checked });
$('#tAnim').onchange = e => setTheme({ anim: e.target.checked });
$('#tList').onchange = e => setTheme({ list: e.target.checked });
document.querySelectorAll('[data-fx]').forEach(i => i.onchange = () => setTheme({ fx: { ...db.settings.theme.fx, [i.dataset.fx]: i.checked } }));
$('#tBgPick').onclick = async () => { const p = await api.pickCover(); if (p) setTheme({ bgImage: p }); };
$('#tBgClear').onclick = () => setTheme({ bgImage: '' });
$('#tReset').onclick = () => { db.settings.theme = { ...DEFT, fx: { ...DEFT.fx } }; applyTheme(); render(); save(); syncSettings(); };
$('#addFolder').onclick = async () => { const f = await api.pickFolder(); if (f && !db.settings.folders.includes(f)) { db.settings.folders.push(f); await save(); syncSettings(); } };
$('#folders').onclick = async e => { const b = e.target.closest('button'); if (b) { db.settings.folders.splice(+b.dataset.i, 1); await save(); syncSettings(); } };

// курсор-подсветка и 3D-наклон
let mx = 0, my = 0, mt = 0;
addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  if (!mt) mt = requestAnimationFrame(() => { mt = 0; const s = document.documentElement.style; s.setProperty('--mx', mx + 'px'); s.setProperty('--my', my + 'px'); });
});
$('#grid').addEventListener('mousemove', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
  c.style.setProperty('--sx', (x + .5) * 100 + '%'); c.style.setProperty('--sy', (y + .5) * 100 + '%');
  if (db.settings.theme.fx.tilt && !db.settings.theme.list) c.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-4px)`;
});
$('#grid').addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });

// перетаскивание .exe в окно
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', async e => {
  e.preventDefault(); let n = 0;
  for (const f of e.dataTransfer.files) {
    const p = api.pathOf(f);
    if (!/\.(exe|lnk|url|bat)$/i.test(p) || db.games.some(g => g.path.toLowerCase() === p.toLowerCase())) continue;
    db.games.push({ id: crypto.randomUUID(), added: Date.now(), playtime: 0, lastPlayed: 0, favorite: false, category: '', cover: '', launcher: 'Другое', name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''), path: p }); n++;
  }
  if (n) { await save(); render(); toast('Добавлено игр: ' + n); } else toast('Перетащите .exe или ярлык игры');
});

// ---------- поиск игр ----------
let found = [];
$('#btnScan').onclick = async () => {
  toast('Ищем игры…');
  const have = new Set(db.games.map(g => g.path.toLowerCase())), names = new Set(db.games.map(g => g.name.toLowerCase()));
  found = (await api.scan(db.settings.folders)).filter(f => !have.has(f.path.toLowerCase()) && !names.has(f.name.toLowerCase()));
  $('#scanInfo').textContent = found.length ? `Найдено новых игр: ${found.length}. Уберите галочки с лишних.` : '';
  $('#scanList').innerHTML = found.length
    ? found.map((f, i) => `<label class="check"><input type="checkbox" data-i="${i}" checked><span>${esc(f.name)}</span><em>${esc(f.launcher)}</em></label>`).join('')
    : '<div class="empty" style="padding:30px 0">Новых игр не найдено. Добавьте папку с играми в настройках.</div>';
  $('#dlgScan').showModal();
};
$('#scanAll').onclick = () => { const cb = [...document.querySelectorAll('#scanList input')], on = cb.some(c => !c.checked); cb.forEach(c => c.checked = on); };
$('#scanCancel').onclick = () => $('#dlgScan').close();
$('#scanAdd').onclick = async () => {
  const ch = [...document.querySelectorAll('#scanList input:checked')].map(i => found[+i.dataset.i]);
  ch.forEach(f => db.games.push({ id: crypto.randomUUID(), added: Date.now(), playtime: 0, lastPlayed: 0, favorite: false, category: '', cover: '', ...f }));
  await save(); $('#dlgScan').close(); render(); toast('Добавлено игр: ' + ch.length);
};

// ---------- обновления ----------
api.onUpd(({ msg, ready }) => { $('#updMsg').textContent = msg; $('#updInstall').hidden = !ready; if (ready) toast(msg); });
$('#updCheck').onclick = async () => { $('#updMsg').textContent = 'Проверяем…'; const r = await api.updCheck(); if (r.msg) $('#updMsg').textContent = r.msg; };
$('#updInstall').onclick = () => api.updInstall();
api.version().then(v => $('#ver').textContent = 'Версия ' + v);

document.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); } });
const _render = render;
render = function () { _render(); if (animNext) { animNext = false; const g = $('#grid'); g.classList.add('enter'); setTimeout(() => g.classList.remove('enter'), 1400); } };
reload();
