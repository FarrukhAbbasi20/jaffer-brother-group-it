/*  Cartoon avatars
 *
 *  Every person without a photo gets an illustrated cartoon face instead of two initials —
 *  in the top bar, profile menu, Users page, project/board/task/issue/milestone badges and the
 *  Overview workload list. The face is drawn from the person's name, so the same person always
 *  gets the same face on every page and every device. People who picked or uploaded an avatar
 *  keep it (the Users page list is used to look those up by name).
 *
 *  The avatar picker's "Designs" become 12 cartoon faces; initials colours stay as an option.
 *
 *  All faces are drawn here as simple SVG (original artwork, nothing downloaded).
 *  Load after avatar-picker.js.
 */
(function () {
  'use strict';

  /* ---------- deterministic look from a name ---------- */
  function hash(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function pick(arr, n) { return arr[(n >>> 0) % arr.length]; }
  var BG = ['#E3EEF6', '#F6E7E1', '#E6F2EA', '#F5EEDC', '#ECE8F6', '#DFF1F2', '#F7E4EA', '#E8ECF7'];
  var SKIN = [['#F6D3B5', '#E4B394'], ['#EBBF9B', '#D19E78'], ['#D9A276', '#BE8258'], ['#C4855A', '#A56A45'], ['#9C6640', '#7F5030'], ['#7A4A2B', '#5E381F']];   // [tone, shadow]
  var HAIR = [['#1F1B1A', '#3A3230'], ['#2E2320', '#4A3B36'], ['#5A3B25', '#7A5439'], ['#8A5A2B', '#A8753F'], ['#C58B3A', '#DBA85E'], ['#3B2A45', '#54405F'], ['#1A1A1A', '#333']];
  var EYES = ['#4A3626', '#2F5D8A', '#3F7A55', '#6B4B2A', '#4C4C4C'];
  var SHIRT = [['#E9A83D', '#2F6B85'], ['#2F6B85', '#1D3B4F'], ['#7C3AED', '#4C1D95'], ['#C8102E', '#7A0A1C'], ['#0E7490', '#155E75'], ['#3C5A99', '#27407A'], ['#1F8A6B', '#136750'], ['#E36A5C', '#B04A3F'], ['#4B5563', '#1F2937']];   // [shirt, collar]
  var SCARF = ['#7C3AED', '#0E7490', '#C8102E', '#1F8A6B', '#3C5A99', '#B45309', '#BE185D'];
  var FEM = /^(maryam|mariam|ayesha|aisha|fatima|sana|hina|amna|laiba|iqra|kiran|zainab|sadia|rabia|nida|mehwish|sara|sarah|hira|uzma|aliya|farah|saba|noor|anum|bushra|madiha|sidra|mahnoor|areeba|sumaira|faiza|shazia|samina|rukhsana|nadia|asma|tayyaba|huma|sonia|rida|aqsa|nimra|fiza|hafsa|momina|kinza|javeria|zara|emaan|aiman|maria|sehar|komal|hania|mehak|rimsha|alishba|amber|nazia|zoya|maham|urooj|tehreem|maira|misbah|sabeen|bisma|ambreen|nosheen|shaista|saira|lubna|rehana|humaira|erum|iram|attia|neelam|tanzeela|anam|nabeela|shabana|zunaira|dua|arisha)$/i;
  function look(seed) {
    var h = hash(seed), first = String(seed || '').trim().split(/\s+/)[0] || '';
    var fem = FEM.test(first) || (/^picker-f/i.test(seed));
    var o = {
      bg: pick(BG, h), skin: pick(SKIN, h >>> 4), hair: pick(HAIR, h >>> 8), eyes: pick(EYES, h >>> 11), shirt: pick(SHIRT, h >>> 13), scarf: pick(SCARF, h >>> 17),
      fem: fem, glasses: ((h >>> 19) % 5) === 0, smile: (h >>> 23) % 2
    };
    if (fem) { o.style = 5 + ((h >>> 16) % 3); o.beard = 0; }              // 5 long, 6 hijab, 7 bob
    else { o.style = (h >>> 16) % 5; o.beard = (h >>> 21) % 3; }             // 0 short, 1 quiff, 2 curly, 3 fade, 4 slick ; beard 0 none / 1 stubble / 2 full
    if (/^picker-m(\d)/i.test(seed)) { var m = seed.match(/^picker-m(\d)-b(\d)/i); if (m) { o.style = +m[1]; o.beard = +m[2]; } }
    if (/^picker-f(\d)/i.test(seed)) { var g = seed.match(/^picker-f(\d)/i); if (g) o.style = 5 + (+g[1]); }
    return o;
  }

  function face(o) {
    var sk = o.skin[0], sh = o.skin[1], H = o.hair[0], HL = o.hair[1], S = o.shirt[0], C = o.shirt[1];
    var uid = 'c' + Math.random().toString(36).slice(2, 8);
    var s = '<defs><radialGradient id="bgg'+uid+'" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></radialGradient><clipPath id="disc'+uid+'"><circle cx="50" cy="50" r="50"/></clipPath></defs>';
    s += '<circle cx="50" cy="50" r="50" fill="' + o.bg + '"/><circle cx="50" cy="50" r="50" fill="url(#bgg'+uid+')"/>';
    s += '<g clip-path="url(#disc'+uid+')">';
    // long hair sits behind the shoulders
    if (o.style === 5) s += '<path d="M24 46 C22 26 34 14 50 14 C66 14 78 26 76 46 L80 92 C70 96 30 96 20 92Z" fill="' + H + '"/>';
    // shoulders + collared shirt
    s += '<path d="M8 104 C8 82 26 74 42 71 L50 78 L58 71 C74 74 92 82 92 104Z" fill="' + S + '"/>';
    s += '<path d="M42 71 L50 86 L58 71 L54 70 L50 78 L46 70Z" fill="' + C + '"/><path d="M42 71 L36 75 L46 82 L50 78Z M58 71 L64 75 L54 82 L50 78Z" fill="' + C + '"/>';
    // neck with shadow under the chin
    s += '<path d="M42 58 L42 74 C46 78 54 78 58 74 L58 58Z" fill="' + sk + '"/><path d="M42 58 C44 66 56 66 58 58 L58 63 C54 68 46 68 42 63Z" fill="' + sh + '" opacity=".55"/>';
    // ears
    s += '<ellipse cx="28.5" cy="46" rx="4" ry="5.5" fill="' + sk + '"/><ellipse cx="71.5" cy="46" rx="4" ry="5.5" fill="' + sk + '"/><path d="M28 44 q1.5 2 0 4 M72 44 q-1.5 2 0 4" stroke="' + sh + '" stroke-width="1" fill="none"/>';
    // face
    s += '<path d="M50 19 C64 19 72 30 72 44 C72 58 63 70 50 70 C37 70 28 58 28 44 C28 30 36 19 50 19Z" fill="' + sk + '"/>';
    s += '<path d="M31 50 C34 62 42 70 50 70 C58 70 66 62 69 50 C66 60 58 66 50 66 C42 66 34 60 31 50Z" fill="' + sh + '" opacity=".35"/>';
    // hair (front)
    if (o.style === 0) s += '<path d="M28 42 C27 26 36 17 50 17 C64 17 73 26 72 42 C70 34 64 30 58 30 C54 30 52 28 50 26 C46 30 40 31 34 31 C31 34 29 38 28 42Z" fill="' + H + '"/><path d="M36 24 C42 20 50 19 58 21" stroke="' + HL + '" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".6"/>';
    else if (o.style === 1) s += '<path d="M28 42 C27 28 33 16 46 14 C56 12 68 16 72 30 C73 36 72 40 72 42 C69 33 62 29 55 30 C50 31 44 30 40 33 C34 36 30 38 28 42Z" fill="' + H + '"/><path d="M44 19 C50 16 58 17 63 21" stroke="' + HL + '" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".6"/>';
    else if (o.style === 2) { s += '<path d="M28 42 C27 28 36 18 50 18 C64 18 73 28 72 42 C68 34 60 31 50 31 C40 31 32 34 28 42Z" fill="' + H + '"/>'; for (var i = 0; i < 9; i++) { var a = -Math.PI * (1 - i / 8); s += '<circle cx="' + (50 + Math.cos(a) * 22).toFixed(1) + '" cy="' + (36 + Math.sin(a) * 18).toFixed(1) + '" r="5.5" fill="' + H + '"/>'; } s += '<circle cx="42" cy="21" r="3" fill="' + HL + '" opacity=".5"/><circle cx="58" cy="21" r="3" fill="' + HL + '" opacity=".5"/>'; }
    else if (o.style === 3) s += '<path d="M29 40 C29 27 37 19 50 19 C63 19 71 27 71 40 C68 32 60 29 50 29 C40 29 32 32 29 40Z" fill="' + H + '" opacity=".85"/>';
    else s += '<path d="M28 42 C27 27 35 17 50 17 C65 17 73 27 72 42 C70 33 62 29 50 29 C38 29 30 33 28 42Z" fill="' + H + '"/><path d="M34 27 C40 23 60 23 66 27 M36 24 C42 20 58 20 64 24" stroke="' + HL + '" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".55"/>';
    if (o.style === 5) s += '<path d="M28 42 C27 26 36 17 50 17 C64 17 73 26 72 42 C68 34 60 30 52 30 C48 30 44 31 40 33 C34 35 30 38 28 42Z" fill="' + H + '"/><path d="M40 22 C46 19 54 19 60 22" stroke="' + HL + '" stroke-width="2" stroke-linecap="round" fill="none" opacity=".6"/>';
    if (o.style === 7) s += '<path d="M26 48 C24 26 36 15 50 15 C64 15 76 26 74 48 L74 62 C76 54 74 46 72 40 C68 33 60 30 52 31 C46 31 40 32 36 35 C30 38 27 44 26 52Z" fill="' + H + '"/><path d="M26 52 C26 62 30 68 36 70 C32 62 30 56 30 50Z M74 52 C74 62 70 68 64 70 C68 62 70 56 70 50Z" fill="' + H + '"/>';
    // eyebrows
    var bw = o.fem ? 2.2 : 3;
    s += '<path d="M38.5 36.5 C41 33.5 45 33.8 47.5 35.5 M52.5 35.5 C55 33.8 59 33.5 61.5 36.5" stroke="' + H + '" stroke-width="' + bw + '" stroke-linecap="round" fill="none"/>';
    // eyes
    ['42', '58'].forEach(function (cx) {
      s += '<ellipse cx="' + cx + '" cy="43" rx="4" ry="2.8" fill="#FFFFFF"/><circle cx="' + cx + '" cy="43.3" r="2.2" fill="' + o.eyes + '"/><circle cx="' + cx + '" cy="43.3" r="1.1" fill="#111"/><circle cx="' + (+cx + 0.9) + '" cy="42.4" r=".7" fill="#fff"/>';
      s += '<path d="M' + (+cx - 4.8) + ' 42.6 C' + (+cx - 2) + ' 39.6 ' + (+cx + 2) + ' 39.6 ' + (+cx + 4.8) + ' 42.6" stroke="' + H + '" stroke-width="1.3" stroke-linecap="round" fill="none"/>';
    });
    if (o.fem) s += '<path d="M37.5 42.2 l-1.5 -1 M62.5 42.2 l1.5 -1" stroke="' + H + '" stroke-width="1.2" stroke-linecap="round"/>';
    // nose
    s += '<path d="M50 44 C49 49 47.5 51 47.5 53 C48.5 54.6 51.5 54.6 52.5 53" stroke="' + sh + '" stroke-width="1.5" stroke-linecap="round" fill="none"/>';
    // mouth
    if (o.smile) s += '<path d="M44 58.5 C47 62.5 53 62.5 56 58.5 C52 60 48 60 44 58.5Z" fill="#8E3B3B"/><path d="M45.5 59 C48 60.4 52 60.4 54.5 59" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".85"/>';
    else s += '<path d="M44.5 58.5 C47 61 53 61 55.5 58.5" stroke="#8E3B3B" stroke-width="1.8" stroke-linecap="round" fill="none"/>';
    // beard
    if (o.beard === 2) s += '<path d="M30 46 C31 62 40 71 50 71 C60 71 69 62 70 46 C68 58 60 63 50 63 C40 63 32 58 30 46Z" fill="' + H + '"/><path d="M43 55 C46 53 54 53 57 55 C55 57 45 57 43 55Z" fill="' + H + '"/><path d="M45 61.5 C48 64.5 52 64.5 55 61.5" stroke="' + HL + '" stroke-width="1" fill="none" opacity=".4"/>';
    else if (o.beard === 1) s += '<path d="M31 47 C32 61 41 70 50 70 C59 70 68 61 69 47 C67 58 59 64 50 64 C41 64 33 58 31 47Z" fill="' + H + '" opacity=".28"/>';
    // glasses
    if (o.glasses) s += '<circle cx="42" cy="43" r="6.8" fill="none" stroke="#2B2B2B" stroke-width="1.6"/><circle cx="58" cy="43" r="6.8" fill="none" stroke="#2B2B2B" stroke-width="1.6"/><path d="M48.8 43 h2.4 M35.2 42 l-6 1 M64.8 42 l6 1" stroke="#2B2B2B" stroke-width="1.6" stroke-linecap="round"/>';
    // hijab wraps over everything else
    if (o.style === 6) s += '<path d="M50 12 C70 12 80 30 78 48 C77 60 74 68 76 80 C74 92 26 92 24 80 C26 68 23 60 22 48 C20 30 30 12 50 12Z M50 20 C36 20 30 32 31 46 C32 60 40 69 50 69 C60 69 68 60 69 46 C70 32 64 20 50 20Z" fill="' + o.scarf + '" fill-rule="evenodd"/><path d="M28 34 C34 24 42 20 50 20" stroke="#fff" stroke-width="1.5" fill="none" opacity=".25"/>';
    s += '</g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">' + s + '</svg>';
  }
  function svgFor(seed) { return face(look(seed)); }
  function urlFor(seed) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(seed)); }
  window.cartoonAvatar = { svg: svgFor, url: urlFor, face: face, look: look, palettes: { BG: BG, SKIN: SKIN, HAIR: HAIR, EYES: EYES, SHIRT: SHIRT, SCARF: SCARF } };

  /* ---------- who has a real (picked / uploaded) avatar ---------- */
  function lc(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function knownAvatar(name) {
    var n = lc(name); if (!n) return '';
    try { if (currentUser && lc(currentUser.name) === n) return currentUser.avatarUrl || ''; } catch (_) {}
    try { var u = (usersList || []).filter(function (x) { return lc(x.name) === n; })[0]; if (u && u.avatarUrl) return u.avatarUrl; } catch (_) {}
    return '';
  }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  function namesPool() {
    var out = [];
    function add(v) { [].concat(v || []).forEach(function (n) { n = String(n || '').trim(); if (n && out.indexOf(n) < 0) out.push(n); }); }
    try { (usersList || []).forEach(function (u) { add(u.name); }); } catch (_) {}
    try { (assignableUsers || []).forEach(function (u) { add(u.name); }); } catch (_) {}
    try { (data || []).forEach(function (p) { add(p.owners); add(p.leads); add(p.owner); add(p.lead); (p.milestones || []).forEach(function (m) { add(m.owners); add(m.owner); add(m.leads); }); }); } catch (_) {}
    try { (standalone || []).forEach(function (m) { add(m.owners); add(m.owner); }); } catch (_) {}
    try { add(currentUser && currentUser.name); } catch (_) {}
    return out;
  }

  /* ---------- paint badges ---------- */
  var BADGES = '.pj3-ava,.kb3-ava,.tk3-ava,.ms3-ava,.anx-av,.us3-ava,.pd-av,.ov3-avatar,.iss3-ava';
  function nameOf(el) {
    var t = el.getAttribute('title') || el.getAttribute('data-name') || '';
    if (!t) { var p = el.closest('[title]'); if (p && p !== el) t = p.getAttribute('title') || ''; }
    if (t) return t.split(/\s*[,&]\s*/)[0].trim();
    // issues / users rows put the name right after the badge
    var sib = el.nextSibling; if (sib && sib.nodeType === 3 && sib.textContent.trim()) return sib.textContent.trim();
    if (sib && sib.nodeType === 1 && /^(strong|b|span)$/i.test(sib.tagName) && sib.textContent.trim().length > 2) return sib.textContent.trim();
    // workload list: name sits in the next element's first line
    var main = el.parentElement && el.parentElement.querySelector('.anx-tw-name'); if (main) return main.textContent.trim();
    // last resort: match the initials against people we know
    var ini = el.textContent.trim().toUpperCase(); if (!/^[A-Z]{1,2}$/.test(ini)) return '';
    var hit = namesPool().filter(function (n) { return initials(n) === ini; })[0];
    return hit || '';
  }
  function paint(el) {
    if (el.getAttribute('data-cartoon') === '1') return;
    if (el.classList.contains('empty') || el.classList.contains('is-blank')) return;
    var name = nameOf(el); if (!name || name === '-') return;
    var url = knownAvatar(name) || urlFor(name);
    el.setAttribute('data-cartoon', '1');
    el.setAttribute('data-initials', el.textContent.trim());
    el.style.setProperty('background-image', 'url("' + String(url).replace(/"/g, '') + '")', 'important');
    el.style.setProperty('background-size', 'cover', 'important'); el.style.setProperty('background-position', 'center', 'important'); el.style.setProperty('background-color', 'transparent', 'important');
    el.style.setProperty('color', 'transparent', 'important'); el.style.textShadow = 'none';
    if (!el.getAttribute('title')) el.setAttribute('title', name);
  }
  function sweep(root) { (root || document).querySelectorAll(BADGES).forEach(paint); }
  var t; function soon() { clearTimeout(t); t = setTimeout(function () { sweep(); }, 40); }
  try { new MutationObserver(function (m) { soon(); }).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  soon(); setTimeout(soon, 1500); setTimeout(soon, 4000);

  /* top bar + profile menu: the app's own painter, with a cartoon when there is no photo */
  try {
    var prevPaint = paintAvatarEl;
    paintAvatarEl = function (el, name, avatarUrl) {
      var r = prevPaint(el, name, avatarUrl || urlFor(name || 'User'));
      try { if (el && el.style.backgroundImage) { var img = el.style.backgroundImage; el.style.setProperty('background-image', img, 'important'); el.style.setProperty('background-size', 'cover', 'important'); el.style.setProperty('background-position', 'center', 'important'); el.style.setProperty('background-color', 'transparent', 'important'); } } catch (_) {}
      return r;
    };
    if (typeof syncAuthUi === 'function') setTimeout(function () { try { syncAuthUi(); } catch (_) {} }, 0);
  } catch (_) {}

  /* the picker's "Designs" become cartoon faces (initials colours stay) */
  try {
    if (window.__avatarPicker && typeof window.__avatarPicker.setDesigns === 'function') {
      var seeds = ['picker-m0-b2 A', 'picker-m1-b0 B', 'picker-m2-b1 C', 'picker-m4-b2 D', 'picker-m3-b0 E', 'picker-m0-b0 F', 'picker-m1-b2 G', 'picker-m2-b0 H', 'picker-f0 I', 'picker-f1 J', 'picker-f2 K', 'picker-f0 L'];
      window.__avatarPicker.setDesigns(seeds.map(function (s, i) { return { id: 'face' + (i + 1), name: 'Avatar ' + (i + 1), svg: function () { return svgFor(s); } }; }), 'Avatars');
    }
  } catch (_) {}


  /* ---------- Create-your-own builder in the avatar picker ---------- */
  (function installBuilder() {
    var STYLES = [
      { v: 0, lab: 'Short' }, { v: 1, lab: 'Quiff' }, { v: 2, lab: 'Curly' }, { v: 3, lab: 'Fade' },
      { v: 4, lab: 'Slick' }, { v: 5, lab: 'Long' }, { v: 6, lab: 'Hijab' }, { v: 7, lab: 'Bob' }
    ];
    var state = null;
    function defaultState() {
      var name = '';
      try { name = (currentUser && currentUser.name) || 'User'; } catch (_) { name = 'User'; }
      return Object.assign({ fem: false, glasses: false, smile: 1, beard: 0, style: 0 }, look(name));
    }
    function css() {
      if (document.getElementById('avp-builder-css')) return;
      var el = document.createElement('style'); el.id = 'avp-builder-css';
      el.textContent = [
        '.avp-build{margin-top:6px;padding:12px;border:1px solid var(--border,#E2E8F0);border-radius:14px;background:var(--surface,#fff)}',
        '.avp-build-top{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}',
        '.avp-build-prev{width:112px;height:112px;border-radius:50%;overflow:hidden;flex:none;border:3px solid var(--border,#E2E8F0);background:#eee}',
        '.avp-build-prev img{width:100%;height:100%;display:block}',
        '.avp-build-ctrls{flex:1;min-width:220px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}',
        '.avp-build-ctrls label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#64748B)}',
        '.avp-build-ctrls select,.avp-build-ctrls button.sw{font:inherit;font-size:13px;font-weight:600;text-transform:none;letter-spacing:0;padding:6px 8px;border-radius:8px;border:1px solid var(--border,#E2E8F0);background:var(--surface,#fff);color:inherit}',
        '.avp-swatch{display:flex;flex-wrap:wrap;gap:5px}',
        '.avp-swatch button{width:22px;height:22px;border-radius:50%;border:2px solid transparent;padding:0;cursor:pointer}',
        '.avp-swatch button.on{border-color:#1677FF;box-shadow:0 0 0 2px #fff,0 0 0 3px #1677FF}',
        '.avp-build-toggles{display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1}',
        '.avp-build-toggles button{font:inherit;font-size:12px;font-weight:650;padding:6px 10px;border-radius:999px;border:1px solid var(--border,#E2E8F0);background:transparent;cursor:pointer}',
        '.avp-build-toggles button.on{background:#1677FF;color:#fff;border-color:#1677FF}',
        '.avp-build-apply{margin-top:10px}',
        '@media(max-width:560px){.avp-build-ctrls{grid-template-columns:1fr}}'
      ].join('\n');
      document.head.appendChild(el);
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
    function swatches(arr, key, getColor) {
      return '<div class="avp-swatch" data-key="' + key + '">' + arr.map(function (item, i) {
        var col = getColor(item);
        var on = JSON.stringify(state[key]) === JSON.stringify(item) || state[key] === item ? ' on' : '';
        return '<button type="button" class="' + on.trim() + '" data-i="' + i + '" style="background:' + col + '" title="' + key + ' ' + (i + 1) + '"></button>';
      }).join('') + '</div>';
    }
    function render() {
      var host = document.getElementById('avpBuilder');
      if (!host || !state) return;
      var svg = face(state);
      host.querySelector('#avpBuildPrev').src = svgUrl(svg);
      host.querySelector('#avpHairStyle').value = String(state.style);
      host.querySelectorAll('.avp-swatch[data-key="bg"] button').forEach(function (b, i) { b.classList.toggle('on', state.bg === BG[i]); });
      host.querySelectorAll('.avp-swatch[data-key="skin"] button').forEach(function (b, i) { b.classList.toggle('on', state.skin === SKIN[i]); });
      host.querySelectorAll('.avp-swatch[data-key="hair"] button').forEach(function (b, i) { b.classList.toggle('on', state.hair === HAIR[i]); });
      host.querySelectorAll('.avp-swatch[data-key="eyes"] button').forEach(function (b, i) { b.classList.toggle('on', state.eyes === EYES[i]); });
      host.querySelectorAll('.avp-swatch[data-key="shirt"] button').forEach(function (b, i) { b.classList.toggle('on', state.shirt === SHIRT[i]); });
      host.querySelectorAll('.avp-swatch[data-key="scarf"] button').forEach(function (b, i) { b.classList.toggle('on', state.scarf === SCARF[i]); });
      host.querySelector('[data-tog="smile"]').classList.toggle('on', !!state.smile);
      host.querySelector('[data-tog="glasses"]').classList.toggle('on', !!state.glasses);
      host.querySelector('[data-tog="fem"]').classList.toggle('on', !!state.fem);
      var beardWrap = host.querySelector('#avpBeardWrap');
      if (beardWrap) beardWrap.style.display = state.fem || state.style === 6 ? 'none' : '';
      var scarfWrap = host.querySelector('#avpScarfWrap');
      if (scarfWrap) scarfWrap.style.display = state.style === 6 ? '' : 'none';
    }
    function mount() {
      css();
      var body = document.querySelector('#avatarModal .mbody');
      if (!body || document.getElementById('avpBuilder')) return;
      state = defaultState();
      var html = '<div class="avp-sec">Create your own</div><div class="avp-build" id="avpBuilder">' +
        '<div class="avp-build-top">' +
          '<div class="avp-build-prev"><img id="avpBuildPrev" alt="Preview"></div>' +
          '<div class="avp-build-ctrls">' +
            '<label>Hair / style<select id="avpHairStyle">' + STYLES.map(function (x) { return '<option value="' + x.v + '">' + x.lab + '</option>'; }).join('') + '</select></label>' +
            '<label id="avpBeardWrap">Beard<select id="avpBeard"><option value="0">None</option><option value="1">Stubble</option><option value="2">Full</option></select></label>' +
            '<label>Background' + swatches(BG, 'bg', function (c) { return c; }) + '</label>' +
            '<label>Skin' + swatches(SKIN, 'skin', function (c) { return c[0]; }) + '</label>' +
            '<label>Hair colour' + swatches(HAIR, 'hair', function (c) { return c[0]; }) + '</label>' +
            '<label>Eyes' + swatches(EYES, 'eyes', function (c) { return c; }) + '</label>' +
            '<label>Shirt' + swatches(SHIRT, 'shirt', function (c) { return c[0]; }) + '</label>' +
            '<label id="avpScarfWrap">Hijab' + swatches(SCARF, 'scarf', function (c) { return c; }) + '</label>' +
            '<div class="avp-build-toggles">' +
              '<button type="button" data-tog="smile">Smile</button>' +
              '<button type="button" data-tog="glasses">Glasses</button>' +
              '<button type="button" data-tog="fem">Feminine features</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="avp-build-apply"><button type="button" class="btn primary" id="avpBuildSave">Use this avatar</button></div>' +
      '</div>';
      var designs = document.getElementById('avpDesigns');
      if (designs && designs.parentNode) designs.parentNode.insertBefore(document.createRange().createContextualFragment(html), designs.nextSibling);
      else body.insertAdjacentHTML('beforeend', html);

      var host = document.getElementById('avpBuilder');
      host.querySelector('#avpHairStyle').addEventListener('change', function () { state.style = +this.value; if (state.style === 6) state.beard = 0; render(); });
      host.querySelector('#avpBeard').addEventListener('change', function () { state.beard = +this.value; render(); });
      host.querySelectorAll('.avp-swatch').forEach(function (row) {
        row.addEventListener('click', function (ev) {
          var b = ev.target.closest('button'); if (!b) return;
          var key = row.getAttribute('data-key'); var i = +b.getAttribute('data-i');
          var map = { bg: BG, skin: SKIN, hair: HAIR, eyes: EYES, shirt: SHIRT, scarf: SCARF };
          state[key] = map[key][i];
          render();
        });
      });
      host.querySelectorAll('[data-tog]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var k = btn.getAttribute('data-tog');
          if (k === 'smile') state.smile = state.smile ? 0 : 1;
          else if (k === 'glasses') state.glasses = !state.glasses;
          else if (k === 'fem') { state.fem = !state.fem; if (state.fem) state.beard = 0; }
          render();
        });
      });
      host.querySelector('#avpBuildSave').addEventListener('click', async function () {
        var box = document.querySelector('#avatarModal .modal');
        try {
          if (box) box.classList.add('avp-busy');
          var dataUrl = await toPng(face(state));
          var res = await fetch('/api/auth/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: dataUrl }) });
          var body = await res.json().catch(function () { return {}; });
          if (!res.ok) throw new Error(body.error || 'Could not save avatar');
          try { currentUser = body.user || currentUser; } catch (_) {}
          try { localStorage.setItem('jbg-avatar-pick', 'custom'); } catch (_) {}
          document.querySelectorAll('#avatarModal .avp-opt').forEach(function (o) { o.classList.remove('on'); });
          try { if (typeof syncAuthUi === 'function') syncAuthUi(); } catch (_) {}
          var big = document.getElementById('avpBig');
          if (big && currentUser && currentUser.avatarUrl) { big.textContent = ''; big.style.backgroundImage = 'url("' + String(currentUser.avatarUrl).replace(/"/g, '') + '")'; }
        } catch (err) { alert(err.message || 'Could not save avatar'); }
        finally { if (box) box.classList.remove('avp-busy'); }
      });
      render();
    }
    var prevOpen = window.openAvatarEditor;
    window.openAvatarEditor = function () {
      var r = typeof prevOpen === 'function' ? prevOpen.apply(this, arguments) : undefined;
      setTimeout(mount, 0);
      return r;
    };
  })();

})();
