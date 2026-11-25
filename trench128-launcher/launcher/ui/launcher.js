'use strict';
// Launcher page. Everything from the network (server names, notes) is shown as text, never as HTML.
(() => {
  const L = window.launcher, $ = id => document.getElementById(id);
  let st = null, list = [], sel = '', busy = false, toastT = 0;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 3800); }
  const host = u => { try { return new URL(u).host; } catch (e) { return u; } };

  /* ---------- tabs */
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
    for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.id === 'tab-' + b.dataset.tab);
    if (b.dataset.tab === 'news') loadNews();
  };

  /* ---------- servers */
  function pick(url) {
    sel = url || ''; for (const r of $('rows').children) r.classList.toggle('sel', r.dataset.url === sel);
    const e = list.find(s => s.url === sel); $('selname').textContent = sel ? (e && e.info ? e.info.name : host(sel)) : '—';
    $('play').disabled = !sel || busy; if (sel) $('addr').value = host(sel);
    $('fav').textContent = st && st.settings.favourites.includes(sel) ? '★ Favourite' : '☆ Favourite';
  }
  function row(s) {
    const r = el('div', 'srow' + (s.ok ? '' : ' down')); r.dataset.url = s.url; r.tabIndex = 0; r.setAttribute('role', 'option');
    const star = el('button', 'star' + (st.settings.favourites.includes(s.url) ? ' on' : ''), st.settings.favourites.includes(s.url) ? '★' : '☆');
    star.title = 'Favourite'; star.onclick = async ev => { ev.stopPropagation(); st.settings = await L.favourite(s.url, !st.settings.favourites.includes(s.url)); render(); };
    const nm = el('div', 'nm', s.info ? s.info.name : host(s.url)); nm.append(el('small', null, host(s.url) + (s.info && s.info.region ? ' · ' + s.info.region : '') + (s.ok ? '' : ' · ' + (s.err || 'offline'))));
    const pl = el('span', null, s.info ? s.info.players + ' / ' + s.info.max + (s.info.bots ? '  +' + s.info.bots + ' AI' : '') : '—');
    const pg = el('span', 'ping ' + (!s.ok ? '' : s.ping < 80 ? 'good' : s.ping < 160 ? 'mid' : 'bad'), s.ok ? s.ping + ' ms' : '—');
    const vr = el('span', 'muted', s.info && s.info.version ? 'v' + s.info.version : '');
    r.append(star, nm, pl, pg, vr);
    r.onclick = () => pick(s.url); r.ondblclick = () => { pick(s.url); play(); };
    r.onkeydown = e => { if (e.key === 'Enter') { pick(s.url); play(); } else if (e.key === 'ArrowDown' && r.nextSibling) r.nextSibling.focus(); else if (e.key === 'ArrowUp' && r.previousSibling) r.previousSibling.focus(); };
    r.onfocus = () => pick(s.url);
    return r;
  }
  function render() {
    const rows = $('rows'); rows.textContent = ''; for (const s of list) rows.append(row(s));
    $('empty').hidden = list.length > 0; pick(sel && list.some(s => s.url === sel) ? sel : sel);
  }
  async function refresh() {
    $('listmsg').textContent = 'Looking for servers…'; $('refresh').disabled = true;
    try {
      const r = await L.servers(); list = r.servers || [];
      const up = list.filter(s => s.ok).length;
      $('listmsg').textContent = r.err ? r.err : list.length ? up + ' of ' + list.length + ' online' : '';
      if (!sel) sel = (st.settings.lastServer && list.some(s => s.url === st.settings.lastServer)) ? st.settings.lastServer : (list.find(s => s.ok) || {}).url || '';
      render();
    } catch (e) { $('listmsg').textContent = 'Could not load servers'; }
    $('refresh').disabled = false;
  }
  async function direct() {
    const v = $('addr').value.trim(); if (!v) { toast('Type a server address first', true); return null; }
    const p = await L.probe(v);
    if (!p.ok) { toast((p.url || v) + ': ' + (p.err || 'no answer'), true); return null; }
    const i = list.findIndex(s => s.url === p.url); if (i >= 0) list[i] = { ...list[i], ...p }; else list.unshift({ ...p, recent: true });
    render(); pick(p.url); return p.url;
  }

  /* ---------- play */
  async function play() {
    if (busy) return; const name = $('callsign').value.trim();
    if (!name) { toast('Pick a callsign first', true); $('callsign').focus(); return; }
    let url = sel; if (!url) url = await direct(); if (!url) return;
    busy = true; $('play').disabled = true; $('play').textContent = '…';
    try { await saveCallsign(); const r = await L.play(url); if (!r || !r.ok) toast((r && r.err) || 'Could not start the game', true); }
    finally { busy = false; $('play').textContent = 'PLAY'; pick(sel || url); }
  }
  async function saveCallsign() { const v = $('callsign').value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16); if (st.settings.callsign !== v) st.settings = await L.saveSettings({ callsign: v }); }

  /* ---------- patch notes */
  let newsDone = false;
  async function loadNews() {
    if (newsDone) return; newsDone = true; const box = $('news'); box.textContent = '';
    const items = await L.news().catch(() => []);
    if (!items.length) { box.append(el('p', 'muted', 'No patch notes.')); return; }
    for (const n of items) {
      if (!n || typeof n !== 'object') continue; const a = el('article'); a.append(el('h3', null, String(n.title || '')));
      if (n.date) a.append(el('time', null, String(n.date)));
      const body = Array.isArray(n.body) ? n.body : String(n.body || '').split('\n').filter(Boolean);
      const ul = el('ul'); for (const line of body.slice(0, 60)) ul.append(el('li', null, String(line))); a.append(ul); box.append(a);
    }
  }

  /* ---------- updates */
  function showUpdate(u) {
    const t = $('updtext'), pr = $('prog'), bar = $('progbar'), rs = $('restart'); pr.hidden = true; rs.hidden = true;
    const v = 'Launcher v' + st.version;
    switch (u && u.state) {
      case 'checking': t.textContent = v + ' · checking for updates…'; break;
      case 'downloading': t.textContent = v + ' · downloading v' + (u.version || '') + (u.pct ? ' (' + u.pct + '%)' : '…'); pr.hidden = false; bar.style.width = (u.pct || 0) + '%'; break;
      case 'ready': t.textContent = 'Update v' + u.version + ' ready — it installs when you close the launcher'; rs.hidden = false; break;
      case 'current': t.textContent = v + ' · up to date'; break;
      case 'error': t.textContent = v + ' · ' + (u.msg || 'update check failed'); break;
      case 'dev': t.textContent = v + ' · (development build: updates off)'; break;
      default: t.textContent = v;
    }
  }

  /* ---------- settings */
  function fillSettings() {
    const s = st.settings; $('callsign').value = s.callsign; $('s-fullscreen').checked = s.fullscreen; $('s-autojoin').checked = s.autoJoin; $('s-close').checked = s.closeOnPlay; $('s-master').value = s.masterUrl;
    $('site').hidden = !st.brand.site; $('discord').hidden = !st.brand.discord;
  }
  const setFlag = (id, key) => { $(id).onchange = async () => { st.settings = await L.saveSettings({ [key]: $(id).checked }); }; };
  setFlag('s-fullscreen', 'fullscreen'); setFlag('s-autojoin', 'autoJoin'); setFlag('s-close', 'closeOnPlay');
  $('s-master-save').onclick = async () => { const v = $('s-master').value.trim(); st.settings = await L.saveSettings({ masterUrl: v }); $('s-master').value = st.settings.masterUrl; if (v && !st.settings.masterUrl) toast('That is not a server address', true); else { toast('Saved'); refresh(); } };
  $('checkupd').onclick = async () => showUpdate(await L.checkUpdate());
  $('logs').onclick = () => L.showLogs();
  $('site').onclick = () => L.open(st.brand.site); $('discord').onclick = () => L.open(st.brand.discord);
  $('restart').onclick = () => L.installUpdate();

  /* ---------- wiring */
  $('refresh').onclick = refresh; $('play').onclick = play; $('join').onclick = async () => { const u = await direct(); if (u) play(); };
  $('fav').onclick = async () => { const u = sel || await direct(); if (!u) return; st.settings = await L.favourite(u, !st.settings.favourites.includes(u)); render(); };
  $('addr').onkeydown = e => { if (e.key === 'Enter') $('join').click(); };
  $('callsign').onchange = saveCallsign; $('callsign').onkeydown = e => { if (e.key === 'Enter') play(); };
  document.addEventListener('keydown', e => { if (e.key === 'F5') { e.preventDefault(); refresh(); } });
  L.onUpdate(u => { st.update = u; showUpdate(u); });
  L.onGame(g => { $('play').textContent = g.open ? 'IN GAME' : 'PLAY'; $('play').disabled = !!g.open || !sel; if (!g.open) refresh(); });
  L.onError(msg => toast(String(msg), true));

  L.state().then(s => { st = s; fillSettings(); showUpdate(s.update); refresh(); if (!s.settings.callsign) $('callsign').focus(); });
})();
