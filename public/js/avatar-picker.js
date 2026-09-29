/*  Avatar picker
 *
 *  "Change avatar" in the profile menu now opens a gallery instead of the file dialog:
 *    - Initials: the user's initials on 8 colours
 *    - Designs: 12 built-in illustrations (drawn here as SVG, so nothing is downloaded)
 *    - Upload your own photo (the old behaviour), and Remove (back to plain initials)
 *
 *  A chosen avatar is rendered to a 256px PNG in the browser and saved through the existing
 *  POST /api/auth/avatar endpoint, so the server needs no change and the avatar shows
 *  everywhere avatars already show (top bar, Users page, project cards).
 */
(function () {
  'use strict';

  var COLORS = ['#1677FF', '#7C3AED', '#0E7490', '#B45309', '#047857', '#BE185D', '#C8102E', '#0F2744'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function me() { try { return currentUser || null; } catch (_) { return null; } }

  /* ---------- the built-in designs (all original, simple geometry) ---------- */
  function svgWrap(inner, bg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">' + (bg || '') + inner + '</svg>';
  }
  function grad(id, a, b, angle) {
    var r = (angle || 45) * Math.PI / 180, x2 = 50 + 50 * Math.cos(r), y2 = 50 + 50 * Math.sin(r);
    return '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + (100 - x2) + '" y1="' + (100 - y2) + '" x2="' + x2 + '" y2="' + y2 + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>';
  }
  var DESIGNS_TITLE = 'Designs';
  var DESIGNS = [
    { id: 'sunrise', name: 'Sunrise', svg: function () { return svgWrap(grad('g', '#F97316', '#FDE68A') + '<rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="62" r="22" fill="#FFF7ED"/><rect y="62" width="100" height="38" fill="#7C2D12" opacity=".85"/>'); } },
    { id: 'waves', name: 'Waves', svg: function () { return svgWrap(grad('g', '#0EA5E9', '#1E3A8A') + '<rect width="100" height="100" fill="url(#g)"/><path d="M0 62 Q 15 50 30 62 T 60 62 T 90 62 T 120 62 V100 H0Z" fill="#E0F2FE" opacity=".9"/><path d="M0 76 Q 15 64 30 76 T 60 76 T 90 76 T 120 76 V100 H0Z" fill="#7DD3FC" opacity=".8"/>'); } },
    { id: 'peaks', name: 'Peaks', svg: function () { return svgWrap(grad('g', '#6D28D9', '#C4B5FD', 90) + '<rect width="100" height="100" fill="url(#g)"/><path d="M0 100 L30 45 L45 68 L62 30 L100 100Z" fill="#2E1065"/><path d="M0 100 L22 70 L38 88 L52 62 L80 100Z" fill="#4C1D95"/>'); } },
    { id: 'orbit', name: 'Orbit', svg: function () { return svgWrap('<rect width="100" height="100" fill="#0F172A"/><circle cx="50" cy="50" r="14" fill="#F59E0B"/><ellipse cx="50" cy="50" rx="36" ry="12" fill="none" stroke="#94A3B8" stroke-width="2.5" transform="rotate(-25 50 50)"/><circle cx="82" cy="36" r="4" fill="#38BDF8"/>'); } },
    { id: 'leaf', name: 'Leaf', svg: function () { return svgWrap(grad('g', '#065F46', '#34D399', 135) + '<rect width="100" height="100" fill="url(#g)"/><path d="M28 74 C28 40 50 24 78 22 C80 52 62 74 28 74Z" fill="#ECFDF5"/><path d="M30 72 L74 26" stroke="#059669" stroke-width="2.5" fill="none"/>'); } },
    { id: 'blocks', name: 'Blocks', svg: function () { return svgWrap('<rect width="100" height="100" fill="#111827"/><rect x="14" y="14" width="32" height="32" rx="6" fill="#F43F5E"/><rect x="54" y="14" width="32" height="32" rx="6" fill="#FBBF24"/><rect x="14" y="54" width="32" height="32" rx="6" fill="#38BDF8"/><rect x="54" y="54" width="32" height="32" rx="6" fill="#A3E635"/>'); } },
    { id: 'signal', name: 'Signal', svg: function () { return svgWrap(grad('g', '#1677FF', '#0F2744', 90) + '<rect width="100" height="100" fill="url(#g)"/><rect x="18" y="58" width="12" height="24" rx="3" fill="#BFDBFE"/><rect x="36" y="44" width="12" height="38" rx="3" fill="#93C5FD"/><rect x="54" y="30" width="12" height="52" rx="3" fill="#60A5FA"/><rect x="72" y="18" width="12" height="64" rx="3" fill="#FFFFFF"/>'); } },
    { id: 'spark', name: 'Spark', svg: function () { return svgWrap(grad('g', '#BE185D', '#F9A8D4') + '<rect width="100" height="100" fill="url(#g)"/><path d="M50 16 L57 42 L84 50 L57 58 L50 84 L43 58 L16 50 L43 42Z" fill="#FFF1F2"/>'); } },
    { id: 'dots', name: 'Dots', svg: function () { var d = ''; for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) d += '<circle cx="' + (20 + x * 20) + '" cy="' + (20 + y * 20) + '" r="' + (4 + ((x + y) % 3) * 2) + '" fill="' + ['#FDE68A', '#FCA5A5', '#A5F3FC', '#C4B5FD'][(x * 3 + y) % 4] + '"/>'; return svgWrap('<rect width="100" height="100" fill="#1E293B"/>' + d); } },
    { id: 'moon', name: 'Moon', svg: function () { return svgWrap(grad('g', '#312E81', '#0F172A', 90) + '<rect width="100" height="100" fill="url(#g)"/><circle cx="56" cy="46" r="24" fill="#FDE68A"/><circle cx="66" cy="40" r="22" fill="#1E1B4B"/><circle cx="24" cy="26" r="2" fill="#fff"/><circle cx="80" cy="76" r="2.5" fill="#fff"/><circle cx="34" cy="80" r="1.5" fill="#fff"/>'); } },
    { id: 'compass', name: 'Compass', svg: function () { return svgWrap('<rect width="100" height="100" fill="#0E7490"/><circle cx="50" cy="50" r="34" fill="none" stroke="#CFFAFE" stroke-width="3"/><path d="M50 22 L58 50 L50 78 L42 50Z" fill="#F43F5E"/><path d="M22 50 L50 42 L78 50 L50 58Z" fill="#ECFEFF"/>'); } },
    { id: 'grid', name: 'Grid', svg: function () { return svgWrap(grad('g', '#C8102E', '#7F1D1D', 45) + '<rect width="100" height="100" fill="url(#g)"/><path d="M0 33 H100 M0 66 H100 M33 0 V100 M66 0 V100" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="3"/><circle cx="66" cy="33" r="9" fill="#FDE68A"/>'); } },
    { id: 'wave2', name: 'Ribbon', svg: function () { return svgWrap('<rect width="100" height="100" fill="#134E4A"/><path d="M-10 30 C 20 10, 40 50, 70 30 S 110 10, 120 30 V 55 C 90 75, 70 35, 40 55 S 0 75, -10 55Z" fill="#5EEAD4"/><path d="M-10 62 C 20 42, 40 82, 70 62 S 110 42, 120 62 V 110 H -10Z" fill="#2DD4BF" opacity=".7"/>'); } }
  ];
  function initialsSvg(text, color) {
    return svgWrap('<rect width="100" height="100" fill="' + color + '"/><text x="50" y="50" dy=".36em" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">' + esc(text) + '</text>');
  }
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function toPng(svg) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = 256; c.height = 256; c.getContext('2d').drawImage(img, 0, 0, 256, 256); resolve(c.toDataURL('image/png')); };
      img.onerror = function () { reject(new Error('Could not render avatar')); };
      img.src = svgUrl(svg);
    });
  }

  /* ---------- modal ---------- */
  function css() {
    if (document.getElementById('avp-css')) return;
    var s = document.createElement('style'); s.id = 'avp-css';
    s.textContent = [
      '#avatarModal .modal{max-width:560px}',
      '.avp-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#64748B);margin:14px 0 8px}',
      '.avp-sec:first-child{margin-top:0}',
      '.avp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:10px}',
      '.avp-opt{position:relative;padding:0;border:3px solid transparent;border-radius:16px;background:transparent;cursor:pointer;aspect-ratio:1/1;overflow:hidden;transition:transform .12s ease,border-color .12s ease}',
      '.avp-opt img{display:block;width:100%;height:100%;object-fit:cover;border-radius:12px}',
      '.avp-opt:hover{transform:translateY(-2px)}',
      '.avp-opt:focus-visible{outline:none;box-shadow:var(--focus-ring,0 0 0 3px rgba(22,119,255,.4))}',
      '.avp-opt.on{border-color:#1677FF}',
      '.avp-opt.on::after{content:"";position:absolute;right:6px;bottom:6px;width:16px;height:16px;border-radius:50%;background:#1677FF url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27white%27 stroke-width=%273.5%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M5 12l5 5 9-10%27/%3E%3C/svg%3E") center/10px no-repeat;box-shadow:0 0 0 2px var(--surface,#fff)}',
      '.avp-cur{display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--border,#E2E8F0);border-radius:12px;margin-bottom:6px}',
      '.avp-cur .avp-big{width:56px;height:56px;border-radius:50%;flex:none;background:#1677FF center/cover no-repeat;display:grid;place-items:center;color:#fff;font-weight:800;font-size:20px}',
      '.avp-cur b{display:block;font-size:14px}.avp-cur span{font-size:12px;color:var(--muted,#64748B)}',
      '.avp-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:16px}',
      '.avp-foot .avp-left{display:flex;gap:8px}',
      '.avp-busy{opacity:.6;pointer-events:none}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function modal() {
    var m = document.getElementById('avatarModal'); if (m) return m;
    css();
    m = document.createElement('div'); m.className = 'backdrop'; m.id = 'avatarModal';
    m.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="avpTitle"><div class="mhead"><h3 id="avpTitle">Choose your avatar</h3><button type="button" class="modal-close" aria-label="Close" title="Close" data-avp="close">x</button></div>' +
      '<div class="mbody"><div class="fld full"><div class="avp-cur"><div class="avp-big" id="avpBig"></div><div><b id="avpName"></b><span id="avpHint">This is your current avatar. Pick another below, or upload a photo.</span></div></div>' +
      '<div class="avp-sec">Your initials</div><div class="avp-grid" id="avpInitials"></div>' +
      '<div class="avp-sec" id="avpDesignsTitle">' + esc(DESIGNS_TITLE) + '</div><div class="avp-grid" id="avpDesigns"></div>' +
      '<div class="avp-foot"><div class="avp-left"><button type="button" class="btn" data-avp="upload">Upload a photo…</button><button type="button" class="btn ghost" data-avp="remove">Remove avatar</button></div><button type="button" class="btn primary" data-avp="done">Done</button></div></div></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-avp]'); var opt = ev.target.closest('.avp-opt');
      if (ev.target === m) { close(); return; }
      if (opt) { choose(opt.getAttribute('data-svg-id')); return; }
      if (!a) return;
      var k = a.getAttribute('data-avp');
      if (k === 'close' || k === 'done') close();
      else if (k === 'upload') { close(); if (typeof legacyOpen === 'function') legacyOpen(); }
      else if (k === 'remove') remove();
    });
    return m;
  }
  var legacyOpen = null, svgs = {};
  function close() { var m = document.getElementById('avatarModal'); if (m) m.classList.remove('on'); }
  function paintCurrent() {
    var u = me() || {}, big = document.getElementById('avpBig'), nm = document.getElementById('avpName');
    if (nm) nm.textContent = u.name || '';
    var fallback = (window.cartoonAvatar && window.cartoonAvatar.url) ? window.cartoonAvatar.url(u.name || 'User') : '';
    if (big) { big.textContent = (u.avatarUrl || fallback) ? '' : initials(u.name); big.style.backgroundImage = 'url("' + String(u.avatarUrl || fallback).replace(/"/g, '') + '")'; }
    try { if (typeof syncAuthUi === 'function') syncAuthUi(); } catch (_) {}
  }
  function open() {
    var m = modal(), u = me() || {}, ini = initials(u.name);
    svgs = {};
    var gI = document.getElementById('avpInitials'), gD = document.getElementById('avpDesigns');
    gI.innerHTML = COLORS.map(function (c, i) { var id = 'ini' + i; svgs[id] = initialsSvg(ini, c); return '<button type="button" class="avp-opt" data-svg-id="' + id + '" title="' + esc(ini) + ' on colour ' + (i + 1) + '"><img alt="" src="' + svgUrl(svgs[id]) + '"></button>'; }).join('');
    gD.innerHTML = DESIGNS.map(function (d) { svgs[d.id] = d.svg(); return '<button type="button" class="avp-opt" data-svg-id="' + d.id + '" title="' + esc(d.name) + '"><img alt="" src="' + svgUrl(svgs[d.id]) + '"></button>'; }).join('');
    var last = ''; try { last = localStorage.getItem('jbg-avatar-pick') || ''; } catch (_) {}
    if (last && u.avatarUrl) { var b = m.querySelector('.avp-opt[data-svg-id="' + last + '"]'); if (b) b.classList.add('on'); }
    paintCurrent();
    m.classList.add('on');
  }
  async function save(dataUrl) {
    var res = await fetch('/api/auth/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: dataUrl }) });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(body.error || 'Could not save avatar');
    try { currentUser = body.user || currentUser; } catch (_) {}
  }
  async function choose(id) {
    var m = document.getElementById('avatarModal'), box = m && m.querySelector('.modal');
    try {
      if (box) box.classList.add('avp-busy');
      await save(await toPng(svgs[id]));
      try { localStorage.setItem('jbg-avatar-pick', id); } catch (_) {}
      m.querySelectorAll('.avp-opt').forEach(function (o) { o.classList.toggle('on', o.getAttribute('data-svg-id') === id); });
      paintCurrent();
    } catch (err) { alert(err.message || 'Could not save avatar'); }
    finally { if (box) box.classList.remove('avp-busy'); }
  }
  async function remove() {
    var m = document.getElementById('avatarModal'), box = m && m.querySelector('.modal');
    try {
      if (box) box.classList.add('avp-busy');
      var res = await fetch('/api/auth/avatar', { method: 'DELETE', credentials: 'include' });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || 'Could not remove avatar');
      try { currentUser = body.user || currentUser; } catch (_) {}
      try { localStorage.removeItem('jbg-avatar-pick'); } catch (_) {}
      m.querySelectorAll('.avp-opt').forEach(function (o) { o.classList.remove('on'); });
      paintCurrent();
    } catch (err) { alert(err.message || 'Could not remove avatar'); }
    finally { if (box) box.classList.remove('avp-busy'); }
  }

  try { legacyOpen = openAvatarEditor; openAvatarEditor = open; } catch (_) {}
  window.__avatarPicker = { setDesigns: function (list, title) { if (Array.isArray(list) && list.length) DESIGNS = list; if (title) DESIGNS_TITLE = title; var t = document.getElementById('avpDesignsTitle'); if (t) t.textContent = DESIGNS_TITLE; } };
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
})();
