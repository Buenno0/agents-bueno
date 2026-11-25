/* Agent Office — escritório isométrico vivo
 * Motor próprio em SVG: grade 2:1, paredes, móveis, Olheiros que andam e conversam.
 * Cenas são determinísticas: window.renderAt(sceneKey, stepIndex) reconstrói qualquer passo.
 */
(async function () {
  'use strict';

  // ───────────────────────── estado ao vivo (lista branca pública)
  // Status reais vêm de /api/public/state. Agente que o servidor listar e a página não
  // conhecer ganha mesa sozinho: a planta (layout.js) abre uma sala nova para o grupo dele.
  const BASE = window.AO_DATA;
  const BASE_SLUGS = new Set(BASE.AGENTS.map(a => a.slug));
  const LIVE_STATUS = new Set(['ready', 'working', 'queued', 'waiting']);
  const LIVE_RECENCY = new Set(['nas últimas horas', 'hoje', 'há mais tempo', null]);
  const MAX_EXTRA = 40;
  const okStr = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
  let lastFetch = null; // { ok, code, ms, at, n }
  async function fetchLive(timeoutMs) {
    if (!/^https?:$/.test(location.protocol)) { lastFetch = { ok: false, code: 'arquivo local', ms: 0, at: Date.now() }; return null; }
    const t0 = performance.now();
    lastFetch = { ok: false, code: 'sem resposta', ms: 0, at: Date.now() };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch('/api/public/state', { headers: { Accept: 'application/json' }, credentials: 'omit', signal: ctl.signal });
      lastFetch.code = r.status; lastFetch.ms = Math.round(performance.now() - t0);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Array.isArray(j.agents) || j.agents.length > BASE.AGENTS.length + MAX_EXTRA) return null;
      const valid = x => x && /^[a-z0-9-]{1,48}$/.test(x.slug) && LIVE_STATUS.has(x.status) && LIVE_RECENCY.has(x.lastActiveRelative ?? null);
      const bySlug = new Map(j.agents.filter(valid).map(x => [x.slug, x]));
      if (![...BASE_SLUGS].every(sl => bySlug.has(sl))) return null;
      const extras = [...bySlug.values()].filter(x => !BASE_SLUGS.has(x.slug) && okStr(x.displayName, 60) && okStr(x.room, 40)).map(x => ({
        slug: x.slug, displayName: x.displayName.trim(), room: x.room.trim(),
        roleTitle: okStr(x.roleTitle, 80) ? x.roleTitle.trim() : 'Agente',
        guardrailBadge: okStr(x.guardrailBadge, 40) ? x.guardrailBadge.trim() : null,
        primaryModelFamily: okStr(x.primaryModelFamily, 24) ? x.primaryModelFamily.trim() : null,
        backupPoolsCount: Number.isInteger(x.backupPoolsCount) && x.backupPoolsCount >= 0 && x.backupPoolsCount < 10 ? x.backupPoolsCount : null,
        status: x.status, lastActiveRelative: x.lastActiveRelative ?? null
      }));
      lastFetch.ok = true; lastFetch.n = bySlug.size;
      return { bySlug, extras };
    } catch (e) {
      return null;
    } finally { clearTimeout(t); }
  }
  const firstLive = await fetchLive(1500);

  const D = window.AO_LAYOUT.build(BASE, firstLive ? firstLive.extras : []);
  const S = window.AO_SPRITES.createScene(D);
  const { TW, TH, WALL_H, PART_H, SLAB, W, H, iso, P, esc, shade, box, blocked, key, inside, roomAt, furniture,
    buildDefs, buildBase, buildWalls, buildPartitions, buildFurniture, hatSvg, olheiroInner, olheiroStandalone, moonSvg } = S;
  const SPRITE_K = 0.5;                 // escala do Olheiro (viewBox 100)
  const WALK_SPEED = 3.3;                // tiles por segundo
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  const STATUS_LABEL = { ready: 'Pronto', working: 'Trabalhando', queued: 'Na fila', waiting: 'Esperando aprovação' };

  // ───────────────────────── util
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  // ───────────────────────── mundo

  const { walkable, findPath } = window.AO_LAYOUT.createNav(D, blocked);

  // ───────────────────────── estado
  const svg = $('stage');
  const overlay = $('overlay');
  const stageWrap = $('stageWrap');
  let cam = { x: 0, y: 0, s: 1 }, camTween = null;
  let worldPaused = false;
  let mode = 'visitor';
  let selected = null;
  let hovered = null;
  const actors = new Map();   // slug -> actor
  const log = [];
  const deliveries = {
    'cloud-ops': [{ id: 'dlv_901', state: 'esperando aprovação', text: 'Publicar a nova versão do painel.' }],
    'devops-observabilidade': [{ id: 'dlv_898', state: 'concluída', text: 'Conferir se tudo estava no ar.' }]
  };

  function makeActor(a) {
    return {
      a, slug: a.slug, look: a.look,
      status: a.status, pending: a.pendingApproval ? { ...a.pendingApproval } : null,
      x: a.seat[0] + 0.5, y: a.seat[1] + 0.5, tile: a.seat.slice(),
      path: [], onArrive: null, face: a.facing, carry: false,
      bob: Math.random() * 6, blinkT: 2 + Math.random() * 4, wanderT: 6 + Math.random() * 10,
      away: false, busy: 0, bubble: null, talkT: 0, impactT: 0, node: null, ov: null
    };
  }

  // ───────────────────────── render setup
  let layerObjects;
  function buildScene() {
    const glows = buildFurniture();
    buildPartitions();
    svg.innerHTML = buildDefs() + `<g id="cam"><g id="lBase">${buildBase()}</g><g id="lGlow">${glows}</g><g id="lPath"></g><g id="lWalls">${buildWalls()}</g><g id="lObj"></g></g>`;
    layerObjects = $('lObj');
    furniture.forEach(f => {
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = f.svg;
      f.node = g;
      layerObjects.appendChild(g);
    });
    D.AGENTS.forEach(a => {
      const act = makeActor(a);
      act.node = makeActorNode(act);
      layerObjects.appendChild(act.node);
      act.ov = makeOverlay(act);
      actors.set(a.slug, act);
    });
  }

  function makeActorNode(act) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'actor');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', act.a ? `${act.a.displayName}, ${STATUS_LABEL[act.status] || ''}` : 'Você');
    g.innerHTML = `
      <ellipse class="actor-sel" cx="0" cy="0" rx="22" ry="11" fill="none" stroke="#ffd27a" stroke-width="2.2"/>
      <ellipse cx="0" cy="0" rx="17" ry="7" fill="#05091e" opacity=".45"/>
      <g class="actor-sprite"></g>
      <rect class="actor-hit" x="-24" y="-70" width="48" height="76" fill="transparent"/>`;
    act.node = g;
    dressActor(act);
    g.addEventListener('click', e => { e.stopPropagation(); if (act.a) select(act.slug, true); });
    g.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && act.a) { e.preventDefault(); select(act.slug, true); } });
    g.addEventListener('pointerenter', () => { hovered = act.slug; });
    g.addEventListener('pointerleave', () => { if (hovered === act.slug) hovered = null; });
    return g;
  }

  // (re)desenha o Olheiro com o visual atual
  function dressActor(act) {
    const g = act.node, k = SPRITE_K;
    act.spr = g.querySelector('.actor-sprite');
    act.spr.innerHTML = `<g transform="translate(${-50 * k} ${-133 * k}) scale(${k})">${olheiroInner(act.look)}</g>`;
    act.pupils = g.querySelector('.ol-pupils');
    act.lid = g.querySelector('.ol-lid');
    act.mouth = g.querySelector('.ol-mouth');
    act.carryNode = g.querySelector('.ol-carry');
    act.feetL = g.querySelector('.ol-foot-l');
    act.feetR = g.querySelector('.ol-foot-r');
  }

  function makeOverlay(act) {
    const el = document.createElement('div');
    el.className = 'ov';
    el.innerHTML = `<div class="ov-badge"></div><div class="ov-name">${esc(act.a ? act.a.shortName : 'Você')}</div><div class="ov-arrow"></div>`;
    overlay.appendChild(el);
    return el;
  }

  // ───────────────────────── camera
  const WORLD = { x0: -H * TW / 2 - 20, x1: W * TW / 2 + 20, y0: -WALL_H - 30, y1: (W + H) * TH / 2 + SLAB + 20 };
  function stageSize() { const r = stageWrap.getBoundingClientRect(); return { w: r.width, h: r.height }; }
  function drawerOffset() { return document.body.classList.contains('drawer-open') && window.innerWidth > 900 ? $('drawer').offsetWidth + 24 : 0; }
  function fitCam() {
    const { w, h } = stageSize();
    const ww = WORLD.x1 - WORLD.x0, wh = WORLD.y1 - WORLD.y0;
    const topPad = window.innerWidth > 900 ? 70 : 56, botPad = window.innerWidth > 900 ? 64 : 20;
    const mobile = window.innerWidth <= 900;
    const s = clamp(mobile ? Math.min((w * 1.75) / ww, (h - topPad - botPad) / wh) : Math.min((w - 32) / ww, (h - topPad - botPad) / wh), 0.32, 1.25);
    return { s, x: w / 2 - (WORLD.x0 + ww / 2) * s, y: topPad + (h - topPad - botPad) / 2 - (WORLD.y0 + wh / 2) * s };
  }
  // enquadramento inicial: mais perto que o "andar inteiro" (no desktop corta só as bordas)
  function homeCam() {
    const f = fitCam();
    if (window.innerWidth <= 900) return f;
    const { w, h } = stageSize();
    const k = 1.1, s = f.s * k;
    const cx = w / 2, cy = h / 2 + 18;
    return { s, x: cx - (cx - f.x) * k, y: cy - (cy - f.y) * k };
  }
  const ZMIN = 0.3, ZMAX = 5;
  function setCam(c, ms = 0) {
    if (!ms || REDUCED) { cam = { ...c }; camTween = null; applyCam(); return; }
    camTween = { from: { ...cam }, to: { ...c }, t: 0, ms };
  }
  function applyCam() {
    $('cam').setAttribute('transform', `translate(${cam.x.toFixed(2)} ${cam.y.toFixed(2)}) scale(${cam.s.toFixed(4)})`);
    overlay.style.setProperty('--ovs', clamp(cam.s * 1.35, 0.62, 1.05).toFixed(3));
    if (typeof placeRoomTags === 'function' && roomTags) placeRoomTags();
  }
  function focusOn(slug) {
    const act = actors.get(slug); if (!act) return;
    const { w, h } = stageSize();
    const s = Math.max(cam.s, fitCam().s * 1.7);
    const p = iso(act.x, act.y, 30);
    const visW = w - drawerOffset();
    setCam({ s, x: visW / 2 - p[0] * s, y: h * 0.52 - p[1] * s }, 520);
  }
  function zoomBy(f, cx, cy) {
    const { w, h } = stageSize();
    cx = cx ?? w / 2; cy = cy ?? h / 2;
    const s = clamp(cam.s * f, ZMIN, ZMAX);
    const wx = (cx - cam.x) / cam.s, wy = (cy - cam.y) / cam.s;
    setCam({ s, x: cx - wx * s, y: cy - wy * s }, 160);
  }
  const toScreen = (wx, wy) => [wx * cam.s + cam.x, wy * cam.s + cam.y];
  function screenToTile(px, py) {
    const wx = (px - cam.x) / cam.s, wy = (py - cam.y) / cam.s;
    const a = wy / (TH / 2), b = wx / (TW / 2);
    return [Math.floor((a + b) / 2), Math.floor((a - b) / 2)];
  }

  // ───────────────────────── movimento
  function walkTo(act, tx, ty, onArrive, route = false) {
    act.showRoute = route;
    const sx = Math.floor(act.x), sy = Math.floor(act.y);
    const path = findPath(sx, sy, tx, ty);
    if (path === null) { onArrive && onArrive(); return false; }
    act.path = path; act.onArrive = onArrive || null;
    if (!path.length || REDUCED) { teleport(act, tx, ty); return true; }
    return true;
  }
  function teleport(act, tx, ty) {
    act.path = []; act.x = tx + 0.5; act.y = ty + 0.5;
    const cb = act.onArrive; act.onArrive = null; cb && cb();
  }
  function stepActor(act, dt) {
    if (!act.path.length) return;
    const [nx, ny] = act.path[0];
    const tx = nx + 0.5, ty = ny + 0.5;
    const dx = tx - act.x, dy = ty - act.y, dist = Math.hypot(dx, dy);
    const sdx = (dx - dy); if (Math.abs(sdx) > 0.01) act.face = sdx > 0 ? 1 : -1;
    const stepLen = WALK_SPEED * dt;
    if (dist <= stepLen) {
      act.x = tx; act.y = ty; act.path.shift();
      if (!act.path.length) { const cb = act.onArrive; act.onArrive = null; cb && cb(); }
    } else { act.x += dx / dist * stepLen; act.y += dy / dist * stepLen; }
  }
  const atSeat = act => act.a && Math.abs(act.x - (act.a.seat[0] + 0.5)) < 0.05 && Math.abs(act.y - (act.a.seat[1] + 0.5)) < 0.05 && !act.path.length;
  function sendHome(act, cb) { if (!act.a) return; act.away = false; walkTo(act, act.a.seat[0], act.a.seat[1], () => { act.face = act.a.facing; cb && cb(); }); }

  // ───────────────────────── fala
  function say(act, text, ms) {
    const dur = ms || clamp(1500 + text.length * 38, 2200, 4200);
    if (act.bubble) act.bubble.el.remove();
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = `<b style="--c:${act.look.body}">${esc(act.a ? act.a.shortName : 'Você')}</b>${esc(text)}`;
    overlay.appendChild(el);
    act.bubble = { el, t: 0, dur };
    act.talkT = Math.min(dur, 1400);
    pushLog(act, text);
  }
  function pushLog(act, text) {
    const t = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date());
    log.push({ who: act.a ? act.a.shortName : 'Você', color: act.look.body, text, t });
    if (log.length > 60) log.shift();
    renderLog();
    if (activeTab !== 'chat') $('tabChat').classList.add('has-new');
  }
  function impact(act) { act.impactT = 0.38; }

  function setStatus(slug, st, src = 'sim') {
    const act = actors.get(slug); if (!act) return;
    const prev = act.status;
    act.status = st;
    if (prev !== st && act.a && !muteTrace) traceStatus(act, prev, st, src);
    if (prev !== st && isolated && act.a && act.a.roomKey === isolated.key) renderRoomCard();
    if ((st === 'working' || st === 'queued') && !act.busy && !atSeat(act)) sendHome(act);
    act.node.setAttribute('aria-label', `${act.a.displayName}, ${STATUS_LABEL[st]}`);
  }

  // ───────────────────────── por baixo dos panos
  // Cada coisa que acontece na tela vira uma linha: o que foi, em português, e qual
  // chamada do sistema real faz isso. "simulado" = cena/dados de exemplo; "ao vivo" = veio do servidor.
  const trace = [];
  let muteTrace = false;
  const openDeliveries = new Map();
  const TRACE_KIND = { rede: 'Rede', fila: 'Fila', status: 'Status', aprov: 'Aprovação', planta: 'Planta', local: 'Navegador' };
  const TRACE_SRC = { live: 'ao vivo', sim: 'simulado', local: 'neste navegador' };
  const FLOW_LIGHT = { rede: ['openbot', 'pagina', 'e-op'], fila: ['openbot', 'agentes', 'e-oa'], status: ['agentes'], aprov: ['agentes', 'canal', 'e-co'], planta: ['pagina'], local: ['pagina'], envio: ['canal', 'openbot', 'e-co'] };
  const newId = () => 'dlv_' + Math.random().toString(16).slice(2, 8);
  const shortOf = slug => { const x = actors.get(slug); return x && x.a ? x.a.shortName : slug; };
  function traceEv(kind, plain, tech, src = 'sim', light, track = null) {
    const t = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date());
    trace.push({ kind, plain, tech, src, t, track });
    traceOpen = -1;
    if (trace.length > 120) trace.shift();
    renderTrace();
    lightFlow(light || kind);
    if (activeTab !== 'hood') $('tabHood').classList.add('has-new');
    if ($('hoodPanel').hidden) $('hoodToggle').classList.add('has-new');
  }
  function traceStatus(act, prev, st, src) {
    const n = act.a.shortName, id = openDeliveries.get(act.slug);
    if (id) {
      if (st === 'working') trackStage(id, 'trabalhando', `${n} começou a trabalhar`, 'entrega → running');
      else if (st === 'waiting') trackStage(id, 'aprov', `${n} parou pra pedir aprovação`, 'ask_ui · danger: true');
      else if (st === 'ready' && prev === 'working') trackStage(id, 'pronto', 'Resposta pronta', 'entrega → completed');
    }
    if (st === 'working') traceEv('status', `${n} começou a trabalhar`, id ? `entrega ${id} → running` : 'status → working', src, null, id);
    else if (st === 'queued') traceEv('status', `${n} tem um pedido na fila`, id ? `entrega ${id} → queued` : 'status → queued', src, null, id);
    else if (st === 'waiting') traceEv('aprov', `${n} parou e pediu aprovação humana`, 'ask_ui · danger: true → nada acontece sem um sim', src);
    else if (prev === 'working') { traceEv('status', `${n} terminou`, id ? `entrega ${id} → completed` : 'status → ready', src); openDeliveries.delete(act.slug); }
    else traceEv('status', `${n} ficou livre`, 'status → ready', src);
  }
  // linha do tempo: frase curta + horário; a chamada real aparece ao abrir o passo
  let traceOpen = -1;
  const TL_COLOR = { rede: '#a597ff', fila: '#ffd27a', status: '#5bd1b5', aprov: '#ff6b6b', planta: '#79bcff', local: '#a9b3d9' };
  function renderTrace() {
    const el = $('trace'); if (!el) return;
    if (!trace.length) { el.innerHTML = ''; return; }
    const openIdx = traceOpen >= 0 && traceOpen < trace.length ? traceOpen : trace.length - 1;
    el.innerHTML = trace.map((e, i) => `<li class="tl ${i === openIdx ? 'open' : ''}" style="--c:${TL_COLOR[e.kind] || '#a9b3d9'}">
      <span class="tl-dot" aria-hidden="true"></span>
      <div class="tl-main">
        <button type="button" class="tl-card" data-ti="${i}" aria-expanded="${i === openIdx}">
          <span class="tl-row"><span class="tl-text">${esc(e.plain)}</span><time>${e.t.slice(0, 5)}</time></span>
          ${i === openIdx ? `<code>${esc(e.tech)}</code><span class="tl-src src-${e.src}">${TRACE_SRC[e.src]}</span>` : ''}
        </button>
        ${i === openIdx && e.track ? `<button type="button" class="tr-track" data-track="${esc(e.track)}">Rastrear ${esc(e.track)}</button>` : ''}
      </div></li>`).join('');
    el.scrollTop = el.scrollHeight;
    el.querySelectorAll('[data-ti]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.ti; traceOpen = i === openIdx ? -2 : i;
      lightFlow(trace[i].kind);
      const keep = el.scrollTop; renderTrace(); el.scrollTop = keep;
    }));
    el.querySelectorAll('[data-track]').forEach(b => b.addEventListener('click', () => openTrack(b.dataset.track)));
  }
  const flowTimers = {};
  function lightFlow(kind) {
    (FLOW_LIGHT[kind] || []).forEach(n => {
      const el = document.querySelector(`[data-flow="${n}"]`); if (!el) return;
      el.classList.remove('hot'); void el.getBoundingClientRect(); el.classList.add('hot');
      clearTimeout(flowTimers[n]); flowTimers[n] = setTimeout(() => el.classList.remove('hot'), 1400);
    });
  }
  let activeTab = 'hood';
  function openHood(on) {
    $('hoodPanel').hidden = !on;
    $('hoodToggle').setAttribute('aria-expanded', on);
    document.body.classList.toggle('hood-open', on);
    if (on) { $('hoodToggle').classList.remove('has-new'); setTab(activeTab); }
  }
  function setTab(t) {
    activeTab = t;
    $('tabHood').setAttribute('aria-selected', t === 'hood'); $('tabChat').setAttribute('aria-selected', t === 'chat');
    $('panelHood').hidden = t !== 'hood'; $('log').hidden = t !== 'chat';
    $(t === 'hood' ? 'tabHood' : 'tabChat').classList.remove('has-new');
    if (t === 'hood') renderTrace(); else renderLog();
  }

  // ───────────────────────── cenas
  let scene = null; // { def, step, beat, wait, waitingWalk, holdT, done }
  function sceneDef(k) { return D.SCENES.find(s => s.key === k); }

  function startScene(k) {
    resetWorld(false);
    const def = typeof k === 'string' ? sceneDef(k) : k; if (!def) return;
    scene = { def, step: -1, beat: 0, active: null, holdT: 0, done: false };
    traceEv('local', `Cena “${def.title}” começou`, 'replay gravado: os mesmos passos do fluxo real, sem chamar a IA', 'sim', 'planta');
    worldPaused = false;
    actors.forEach(a => { if (a.a) a.busy = 1; });
    startStep(0);
    renderScenes();
  }
  function startStep(i) {
    scene.step = i; scene.beat = 0; scene.active = null; scene.holdT = 0;
    const st = scene.def.steps[i];
    setCaption(`${i + 1}/${scene.def.steps.length}`, st.caption);
    advanceBeats();
    renderScenes();
  }
  function targetTile(slugOrTile, forWho) {
    if (Array.isArray(slugOrTile)) return slugOrTile;
    const t = actors.get(slugOrTile);
    return t ? t.a.visit : null;
  }
  function runBeat(b, instant) {
    if (b.st) {
      // o primeiro ajuste de status da cena só arruma o palco: não vira linha no rastro
      const setup = scene && scene.step === 0 && b === scene.def.steps[0].beats[0];
      muteTrace = setup;
      Object.entries(b.st).forEach(([s, v]) => setStatus(s, v));
      muteTrace = false;
      return null;
    }
    if (b.wait) return instant ? null : { kind: 'wait', t: b.wait };
    if (b.say) { const act = actors.get(b.say); say(act, b.text); if (instant) return null; impact(act); return { kind: 'wait', t: act.bubble.dur * 0.8 }; }
    if (b.walk || b.home) {
      const act = actors.get(b.walk || b.home);
      const tile = b.home ? act.a.seat : targetTile(b.to, act);
      act.carry = !!b.carry;
      const done = { kind: 'walk', act, arrived: false };
      const trk = !b.home && b.carry && actors.get(b.to) ? trackNew(act.slug, b.to, scene && scene.def ? scene.def.title : 'Pedido') : null;
      const arrive = () => {
        done.arrived = true; act.carry = false;
        if (b.home) act.face = act.a.facing;
        else {
          const tgt = actors.get(b.to);
          if (tgt) {
            act.face = (tgt.x - tgt.y) - (act.x - act.y) >= 0 ? 1 : -1; impact(tgt);
            if (trk) {
              trackStage(trk, 'chegou', `Chegou em ${tgt.a.shortName} · na fila`, 'entrega → queued');
              traceEv('fila', `${act.a.shortName} passou um pedido para ${tgt.a.shortName}`, `POST /v1/agents/${b.to}/messages → 202 · ${trk} na fila`, 'sim', null, trk);
            }
          }
        }
      };
      if (instant) { act.onArrive = null; teleport(act, tile[0], tile[1]); arrive(); return null; }
      walkTo(act, tile[0], tile[1], arrive, !b.home);
      if (b.parallel) return null;
      return done.arrived ? null : done;
    }
    return null;
  }
  function advanceBeats() {
    const beats = scene.def.steps[scene.step].beats;
    while (scene.beat < beats.length) {
      const r = runBeat(beats[scene.beat], false);
      scene.beat++;
      if (r) { scene.active = r; return; }
    }
    scene.active = null; scene.holdT = 900;
  }
  function updateScene(dt) {
    if (!scene || scene.done) return;
    if (scene.active) {
      const a = scene.active;
      if (a.kind === 'wait') { a.t -= dt * 1000; if (a.t <= 0) { scene.active = null; advanceBeats(); } }
      else if (a.kind === 'walk' && a.arrived) { scene.active = null; advanceBeats(); }
      return;
    }
    if (scene.holdT > 0) {
      scene.holdT -= dt * 1000;
      if (scene.holdT <= 0) {
        const anyWalking = [...actors.values()].some(x => x.path.length);
        if (anyWalking) { scene.holdT = 120; return; }
        if (scene.step < scene.def.steps.length - 1) startStep(scene.step + 1);
        else finishScene();
      }
    }
  }
  function finishStepInstant() {
    if (!scene) return;
    const beats = scene.def.steps[scene.step].beats;
    if (scene.active && scene.active.kind === 'walk') {
      const act = scene.active.act; const cb = act.onArrive; act.onArrive = null;
      const last = act.path[act.path.length - 1]; if (last) { act.x = last[0] + 0.5; act.y = last[1] + 0.5; } act.path = []; cb && cb();
    }
    for (; scene.beat < beats.length; scene.beat++) runBeat(beats[scene.beat], true);
    // quem ainda está andando (beats paralelos) chega na hora
    actors.forEach(act => { if (act.path.length) { const last = act.path[act.path.length - 1]; const cb = act.onArrive; act.onArrive = null; act.path = []; act.x = last[0] + 0.5; act.y = last[1] + 0.5; cb && cb(); } });
    scene.active = null; scene.holdT = 0;
  }
  function nextStep() {
    if (!scene || scene.done) return;
    finishStepInstant();
    if (scene.step < scene.def.steps.length - 1) {
      startStep(scene.step + 1);
    } else finishScene();
  }
  function finishScene() {
    scene.done = true;
    actors.forEach(a => { if (a.a) a.busy = 0; });
    setCaption('fim', 'Cena concluída. Rode de novo ou clique em alguém.');
    renderScenes();
  }
  function stopScene() {
    scene = null; worldPaused = false;
    actors.forEach(a => { if (a.a) a.busy = 0; });
    setCaption(null);
    renderScenes();
  }
  function resetWorld(clearLog = true) {
    scene = null; worldPaused = false;
    actors.forEach(act => {
      if (!act.a) return;
      act.status = act.a.status;
      act.pending = act.a.pendingApproval ? { ...act.a.pendingApproval } : null;
      act.path = []; act.onArrive = null; act.carry = false; act.busy = 0; act.away = false;
      act.x = act.a.seat[0] + 0.5; act.y = act.a.seat[1] + 0.5; act.face = act.a.facing;
      if (act.bubble) { act.bubble.el.remove(); act.bubble = null; }
    });
    if (clearLog) { log.length = 0; renderLog(); }
    setCaption(null);
    renderScenes();
  }

  // determinístico: reconstrói o estado exato no fim do passo
  window.renderAt = function (sceneKey, stepIndex) {
    const def = sceneDef(sceneKey); if (!def) return;
    startScene(sceneKey);
    const target = clamp(stepIndex, 0, def.steps.length - 1);
    while (scene.step < target) nextStep();
    finishStepInstant();
    worldPaused = true;
    renderScenes();
  };

  // ───────────────────────── modo comandante: você no escritório
  let you = null;
  function spawnYou() {
    if (you) return;
    you = {
      a: null, slug: 'voce', look: { body: '#f3f5ff', hat: 'crown', hatColor: '#ffd27a' },
      status: 'ready', x: 0.5, y: 2.5, path: [], onArrive: null, face: 1, carry: false,
      bob: 0, blinkT: 3, wanderT: 9e9, busy: 1, bubble: null, talkT: 0, impactT: 0
    };
    you.node = makeActorNode(you);
    you.node.classList.add('is-you');
    layerObjects.appendChild(you.node);
    you.ov = makeOverlay(you);
    you.ov.classList.add('is-you');
    actors.set('voce', you);
    walkTo(you, 2, 3);
  }
  function despawnYou() {
    if (!you) return;
    you.node.remove(); you.ov.remove(); if (you.bubble) you.bubble.el.remove();
    actors.delete('voce'); you = null;
  }
  function dispatchTask(slug, text) {
    const act = actors.get(slug); if (!act) return;
    const rec = { id: trackNew('voce', slug, text), state: 'na fila', text };
    traceEv('rede', `Você mandou uma tarefa para ${act.a.shortName}`, `POST /api/admin/agents/${slug}/messages → 202 · ${rec.id} (prévia: não sai do navegador)`, 'local', 'envio', rec.id);
    (deliveries[slug] = deliveries[slug] || []).unshift(rec);
    const deliver = () => {
      trackStage(rec.id, 'chegou', `Chegou em ${act.a.shortName} · na fila`, 'entrega → queued');
      say(you, text.length > 70 ? text.slice(0, 68) + '…' : text);
      impact(act);
      setStatus(slug, 'queued'); renderDrawer();
      setTimeout(() => { rec.state = 'rodando'; setStatus(slug, 'working'); say(act, 'Recebido. Começando agora.'); renderDrawer(); }, 1300);
      setTimeout(() => { rec.state = 'concluída'; setStatus(slug, act.pending ? 'waiting' : 'ready'); say(act, act.pending ? 'Feito. Aquele pedido de aprovação continua aberto.' : 'Pronto. Entrega registrada.'); renderDrawer(); }, 4600);
    };
    if (you) { you.carry = true; walkTo(you, act.a.visit[0], act.a.visit[1], () => { you.carry = false; you.face = (act.x - act.y) - (you.x - you.y) >= 0 ? 1 : -1; deliver(); }, true); }
    else deliver();
    renderDrawer();
  }
  function decide(slug, ok) {
    const act = actors.get(slug); if (!act || !act.pending) return;
    const title = act.pending.title; act.pending = null;
    traceEv('aprov', `Você ${ok ? 'aprovou' : 'recusou'} o pedido de ${act.a.shortName}`, `resposta ao ask_ui → ${ok ? 'aprovado' : 'recusado'} (prévia)`, 'local', 'aprov');
    (deliveries[slug] = deliveries[slug] || []).unshift({ id: 'apr_' + Math.floor(100 + Math.random() * 899), state: ok ? 'aprovada' : 'recusada', text: title });
    if (you) say(you, ok ? 'Pode seguir.' : 'Agora não.');
    if (ok) {
      setStatus(slug, 'working'); say(act, 'Aplicando. Te aviso no fim.');
      setTimeout(() => { setStatus(slug, act.pending ? 'waiting' : 'ready'); deliveries[slug][0].state = 'concluída'; say(act, 'Feito. Nada fora do plano.'); renderDrawer(); }, 3600);
    } else { setStatus(slug, 'ready'); say(act, 'Ok, descartei o plano.'); }
    impact(act);
    renderDrawer();
  }

  // ───────────────────────── loop
  let last = performance.now();
  let order = [];
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt, now);
    requestAnimationFrame(frame);
  }
  let slideUntil = 0;
  function tick(dt, now) {
    // enquanto o painel desliza, a câmera segue o mapa crescendo (sem pulo no fim)
    if (performance.now() < slideUntil && !selected) { camTween = null; cam = isolated ? roomCam(isolated) : homeCam(); applyCam(); }
    if (camTween) {
      camTween.t += dt * 1000;
      const k = easeOut(clamp(camTween.t / camTween.ms, 0, 1));
      cam = { x: lerp(camTween.from.x, camTween.to.x, k), y: lerp(camTween.from.y, camTween.to.y, k), s: lerp(camTween.from.s, camTween.to.s, k) };
      if (k >= 1) camTween = null;
      applyCam();
    }
    if (!worldPaused) {
      simT += dt;
      tickTour(dt);
      updateScene(dt);
      actors.forEach(act => {
        stepActor(act, dt);
        if (act.bubble) { act.bubble.t += dt * 1000; if (act.bubble.t > act.bubble.dur) { act.bubble.el.classList.add('out'); const el = act.bubble.el; setTimeout(() => el.remove(), 260); act.bubble = null; } }
        if (act.talkT > 0) act.talkT -= dt * 1000;
        if (act.impactT > 0) act.impactT -= dt;
        if (act.danceT > 0) act.danceT -= dt;
        idle(act, dt);
      });
    }
    actors.forEach(act => drawActor(act, now, dt));
    tickMoon(dt);
    tickDebug(dt);
    sortObjects();
  }
  // Avança a simulação sem depender do rAF (testes / capturas quadro a quadro).
  window.AO_advance = function (ms) { let n = performance.now(); for (let t = 0; t < ms; t += 33) { n += 33; tick(0.033, n); } };

  function idle(act, dt) {
    if (!act.a || REDUCED || act.busy || scene) return;
    if (act.status !== 'ready' || act.path.length) return;
    act.wanderT -= dt;
    if (act.wanderT > 0) return;
    if (act.away) { sendHome(act); act.wanderT = 10 + Math.random() * 14; return; }
    const r = D.ROOMS.find(rr => rr.key === act.a.roomKey);
    const goCoffee = Math.random() < 0.18;
    let tx, ty, tries = 0;
    do {
      if (goCoffee) { tx = 1; ty = 6 + Math.floor(Math.random() * 2); }
      else { tx = act.a.seat[0] + Math.round((Math.random() - 0.5) * 6); ty = act.a.seat[1] + Math.round((Math.random() - 0.5) * 6); }
      tries++;
    } while ((!walkable(tx, ty) || (!goCoffee && !(tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1)) || occupied(tx, ty, act)) && tries < 12);
    if (tries < 12) { act.away = true; walkTo(act, tx, ty); }
    act.wanderT = 4 + Math.random() * 6;
  }
  function occupied(tx, ty, self) {
    for (const o of actors.values()) if (o !== self && Math.floor(o.x) === tx && Math.floor(o.y) === ty) return true;
    return D.AGENTS.some(a => a.seat[0] === tx && a.seat[1] === ty && a.slug !== (self.a && self.a.slug));
  }

  function drawRoute(act) {
    const on = (act.showRoute || act.dbgRoute) && act.path.length > 0;
    if (!on) { if (act.routeEl) act.routeEl.style.display = 'none'; return; }
    if (!act.routeEl) {
      act.routeEl = document.createElementNS(NS, 'g');
      act.routeEl.setAttribute('class', 'route');
      act.routeEl.innerHTML = '<polyline class="route-line"/><polygon class="route-end"/><circle class="route-dot" r="3"/>';
      $('lPath').appendChild(act.routeEl);
    }
    act.routeEl.style.display = '';
    act.routeEl.style.setProperty('--c', act.look.body);
    const pts = [iso(act.x, act.y)].concat(act.path.map(([x, y]) => iso(x + 0.5, y + 0.5)));
    act.routeEl.firstChild.setAttribute('points', P(...pts));
    const [ex, ey] = act.path[act.path.length - 1], i = 0.16;
    act.routeEl.children[1].setAttribute('points', P(iso(ex + i, ey + i), iso(ex + 1 - i, ey + i), iso(ex + 1 - i, ey + 1 - i), iso(ex + i, ey + 1 - i)));
    const last = pts[pts.length - 1];
    act.routeEl.children[2].setAttribute('cx', last[0]); act.routeEl.children[2].setAttribute('cy', last[1]);
  }

  function drawActor(act, now, dt) {
    drawRoute(act);
    const p = iso(act.x, act.y);
    const walking = act.path.length > 0 && !worldPaused;
    const seated = act.a && atSeat(act) && (act.status === 'working' || act.status === 'queued');
    let by = 0, rot = 0, sx = 1, sy = 1;
    if (!REDUCED && !worldPaused) act.bob += dt;
    const t = act.bob;
    if (walking) { by = -Math.abs(Math.sin(t * 11)) * 3.2; rot = Math.sin(t * 11) * 3; }
    else if (seated && act.status === 'working') { by = Math.sin(t * 9) * 0.7 + 4; }
    else if (seated) { by = 4; }
    else { by = Math.sin(t * 2.2) * 0.8; sy = 1 + Math.sin(t * 2.2) * 0.012; }
    if (act.danceT > 0 && !REDUCED) { by = -Math.abs(Math.sin(t * 10)) * 7; rot = Math.sin(t * 5) * 14; sy = 1 + Math.sin(t * 10) * 0.04; }
    if (act.impactT > 0) { const k = 1 - act.impactT / 0.38; sx = 1 + Math.sin(k * Math.PI * 2) * 0.08 * (1 - k); sy = 1 - Math.sin(k * Math.PI * 2) * 0.08 * (1 - k); }
    act.node.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
    act.spr.setAttribute('transform', `translate(0 ${by.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${(sx * 1).toFixed(3)} ${sy.toFixed(3)})`);
    // pés alternando
    if (walking) { const f = Math.sin(t * 11) * 3; act.feetL.setAttribute('cy', 131 + f); act.feetR.setAttribute('cy', 131 - f); }
    else { act.feetL.setAttribute('cy', 131); act.feetR.setAttribute('cy', 131); }
    // olhar
    const look = act.face * 3.5 + (act.status === 'working' && seated ? act.face * 1 : 0);
    if (moon.lookUpT > 0) act.pupils.setAttribute('transform', 'translate(4 -6)');
    else if (act.danceT > 0) act.pupils.setAttribute('transform', `translate(${(Math.sin(t * 6) * 4).toFixed(1)} -2)`);
    else act.pupils.setAttribute('transform', `translate(${look.toFixed(1)} ${seated && act.status === 'working' ? 2 : 0})`);
    // piscar
    act.blinkT -= dt;
    let lid = 0;
    if (act.blinkT < 0) { lid = 36; if (act.blinkT < -0.12) act.blinkT = 2.5 + Math.random() * 4; }
    act.lid.setAttribute('height', lid);
    // boca falando
    act.mouth.setAttribute('height', act.talkT > 0 ? 9 + Math.abs(Math.sin(now / 90)) * 8 : 13);
    act.carryNode.setAttribute('opacity', act.carry ? 1 : 0);
    const cls = ['actor', 'st-' + act.status];
    if (act.slug === selected) cls.push('is-selected');
    if (act.slug === hovered) cls.push('is-hover');
    if (!act.a) cls.push('is-you');
    const c = cls.join(' ');
    if (act.node.getAttribute('class') !== c) act.node.setAttribute('class', c);
    // brilho do monitor
    if (act.a) {
      const glow = svg.querySelector(`.screen-glow[data-for="${act.slug}"]`);
      if (glow) glow.style.opacity = act.status === 'working' && atSeat(act) ? 1 : 0;
    }
    // overlay
    const head = toScreen(p[0], p[1] - 128 * SPRITE_K + by);
    act.ov.style.translate = `${head[0].toFixed(1)}px ${head[1].toFixed(1)}px`;
    // nomes aparecem sozinhos quando dá pra ler: sala isolada ou mapa aproximado
    const showName = act.slug === selected || act.slug === hovered || !act.a || (act.a && (!!isolated || cam.s >= 1.35));
    act.ov.classList.toggle('show-name', showName);
    act.ov.classList.toggle('is-selected', act.slug === selected);
    act.ov.dataset.st = act.status;
    const away = !!isolated && (roomAt(Math.floor(act.x), Math.floor(act.y)) || {}).key !== isolated.key;
    if (act.away2 !== away) {
      act.away2 = away;
      act.node.style.display = away ? 'none' : '';
      act.ov.style.display = away ? 'none' : '';
    }
    if (act.bubble) act.bubble.el.style.display = away ? 'none' : '';
    if (act.routeEl && away) act.routeEl.style.display = 'none';
    if (act.bubble) {
      const bp = toScreen(p[0], p[1] - 132 * SPRITE_K + by);
      act.bubble.el.style.transform = `translate(${bp[0].toFixed(1)}px, ${(bp[1] - (showName ? 26 : 12)).toFixed(1)}px)`;
    }
  }

  function sortObjects() {
    const items = [];
    furniture.forEach(f => items.push([f.depth, f.node]));
    actors.forEach(a => items.push([a.x + a.y, a.node]));
    items.sort((a, b) => a[0] - b[0]);
    let changed = items.length !== order.length;
    if (!changed) for (let i = 0; i < items.length; i++) if (items[i][1] !== order[i]) { changed = true; break; }
    if (changed) { items.forEach(it => layerObjects.appendChild(it[1])); order = items.map(i => i[1]); }
  }

  // ───────────────────────── UI
  function select(slug, focus) {
    selected = slug;
    document.body.classList.add('drawer-open');
    renderDrawer();
    if (focus) focusOn(slug);
    const act = actors.get(slug);
    if (act && mode === 'commander' && act.status === 'ready' && !scene) { /* sem side-effects */ }
  }
  function closeDrawer() {
    selected = null;
    document.body.classList.remove('drawer-open');
    reframe(420);
  }

  function counts() {
    const c = { working: 0, ready: 0, queued: 0, waiting: 0 };
    actors.forEach(a => { if (a.a) c[a.status]++; });
    return c;
  }
  let captionOverride = null;
  function setCaption(badge, text) { captionOverride = badge ? { badge, text } : null; renderIsland(); }
  function renderIsland() {
    const el = $('island');
    if (isolated && !captionOverride) {
      const n = D.AGENTS.filter(a => a.roomKey === isolated.key).length;
      el.innerHTML = `<button type="button" class="isl-back" aria-label="Ver o andar todo"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Andar todo</button><span class="isl-room"><i style="background:${isolated.accent || '#a9b3d9'}"></i><b>${esc(isolated.name)}</b> ${n} ${n === 1 ? 'agente' : 'agentes'}</span>`;
      el.classList.remove('is-scene');
      el.querySelector('.isl-back').addEventListener('click', () => isolateRoom(null));
      return;
    }
    if (captionOverride) {
      el.innerHTML = `<span class="isl-badge">${esc(captionOverride.badge)}</span><span class="isl-text">${esc(captionOverride.text)}</span>`;
      el.classList.add('is-scene');
      return;
    }
    el.classList.remove('is-scene');
    const c = counts();
    el.innerHTML = `<span class="isl-live ${liveOn ? 'is-live' : ''}" title="${liveOn ? 'Presença divulgada com atraso' : 'Dados fictícios da demonstração'}"><i></i>${liveOn ? 'Presença publicada' : 'Simulação'}</span>
      <span class="isl-stat"><i class="d d-working"></i><b>${c.working}</b> trabalhando</span>
      <span class="isl-stat"><i class="d d-queued"></i><b>${c.queued}</b> na fila</span>
      <span class="isl-stat ${c.waiting ? 'is-alert' : ''}"><i class="d d-waiting"></i><b>${c.waiting}</b> aguardando</span>
      <button type="button" class="isl-help" aria-label="O que as cores querem dizer" aria-expanded="${!$('legendPop').hidden}">?</button>`;
    el.querySelector('.isl-help').addEventListener('click', e => { e.stopPropagation(); $('legendPop').hidden = !$('legendPop').hidden; renderIsland(); });
  }

  function renderScenes() {
    const box = $('scenes');
    box.innerHTML = D.SCENES.map(s => {
      const active = scene && scene.def.key === s.key;
      const steps = s.steps.length;
      const cur = active ? (scene.done ? steps : scene.step + 1) : 0;
      return `<div class="scene ${active ? 'is-active' : ''}">
        <button class="scene-main" type="button" data-scene="${s.key}" aria-pressed="${active}">
          <span class="scene-play" aria-hidden="true">${active && !scene.done ? (worldPaused ? icon('play') : icon('wave')) : icon('play')}</span>
          <span class="scene-txt"><span class="scene-title">${esc(s.title)}</span></span><span class="scene-n">${steps} passos</span>
        </button>
        ${active ? `<div class="scene-ctl">
          <div class="scene-dots">${s.steps.map((_, i) => `<i class="${i < cur ? 'on' : ''} ${i === cur - 1 && !scene.done ? 'now' : ''}"></i>`).join('')}</div>
          ${scene.done ? `<button type="button" class="mini" data-act="replay">${icon('again')}De novo</button>` : `
          <button type="button" class="mini" data-act="pause" aria-label="${worldPaused ? 'Continuar' : 'Pausar'}">${worldPaused ? icon('play') + 'Continuar' : icon('pause') + 'Pausar'}</button>
          <button type="button" class="mini" data-act="next" ${scene.step >= steps - 1 ? 'disabled' : ''}>${icon('next')}Próximo</button>`}
          <button type="button" class="mini ghost" data-act="stop" aria-label="Sair da cena">${icon('x')}</button>
        </div>` : ''}
      </div>`;
    }).join('');
    renderIsland();
  }

  function renderLog() {
    const el = $('log');
    if (!log.length) { el.innerHTML = `<p class="log-empty">Ninguém falou nada ainda. Rode uma cena e acompanhe a conversa aqui.</p>`; return; }
    el.innerHTML = log.map(l => `<p class="log-line"><span class="log-t">${l.t}</span><b style="--c:${l.color}">${esc(l.who)}</b> ${esc(l.text)}</p>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function icon(n) {
    const p = {
      play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>',
      pause: '<rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/>',
      next: '<path d="M3.5 3.5v9l6-4.5z" fill="currentColor"/><rect x="10.5" y="3.5" width="2.2" height="9" rx="1" fill="currentColor"/>',
      again: '<path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M12.8 2.6v3h-3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      x: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      wave: '<rect x="3" y="6" width="2" height="4" rx="1" fill="currentColor" class="w1"/><rect x="7" y="3.5" width="2" height="9" rx="1" fill="currentColor" class="w2"/><rect x="11" y="5" width="2" height="6" rx="1" fill="currentColor" class="w3"/>',
      left: '<path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      right: '<path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      send: '<path d="M2.5 8h9M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.6" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.6" fill="none"/>',
      ext: '<path d="M6 3.5h6.5V10M12.5 3.5L5 11" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    }[n];
    return `<svg class="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${p}</svg>`;
  }

  // ───────── gaveta: cabeçalho fixo, abas (Sobre · Visual · Tarefas), corpo que rola, rodapé por aba
  let drTab = 'sobre';
  const ST_CHIP = { ready: 'Livre', working: 'Trabalhando', queued: 'Na fila', waiting: 'Espera seu sim' };
  const FACT_ICON = {
    ia: '<rect x="4" y="4" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M8 1.5v2.5M12 1.5v2.5M8 16v2.5M12 16v2.5M1.5 8h2.5M1.5 12h2.5M16 8h2.5M16 12h2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    res: '<path d="M4 7h12M4 13h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13 4l3 3-3 3M7 10l-3 3 3 3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    rule: '<path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M7.5 10l1.8 1.8L13 8" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    seen: '<circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M10 5.5V10l3 2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>'
  };
  // logo de cada IA (marca simplificada, só pra identificar à primeira vista)
  function aiLogo(family) {
    const f = String(family || '').toLowerCase();
    if (f.includes('gemini')) return `<svg class="ai-logo" role="img" aria-label="Gemini" width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="gGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4796e3"/><stop offset=".55" stop-color="#9168c0"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path d="M12 1.5C12.8 7.2 16.8 11.2 22.5 12 16.8 12.8 12.8 16.8 12 22.5 11.2 16.8 7.2 12.8 1.5 12 7.2 11.2 11.2 7.2 12 1.5Z" fill="url(#gGem)"/></svg>`;
    if (f.includes('gpt') || f.includes('openai')) return `<svg class="ai-logo" role="img" aria-label="GPT (OpenAI)" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#0a1230" stroke-width="1.7">${[0, 60, 120, 180, 240, 300].map(r => `<path d="M12 12 L12 4.6 A3.4 3.4 0 0 1 17.9 6.3 L17.4 7.2" transform="rotate(${r} 12 12)" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g><circle cx="12" cy="12" r="2.2" fill="#0a1230"/></svg>`;
    if (f.includes('claude') || f.includes('anthropic')) return `<svg class="ai-logo" role="img" aria-label="Claude" width="24" height="24" viewBox="0 0 24 24"><g stroke="#d97757" stroke-width="2.2" stroke-linecap="round">${[0, 30, 60, 90, 120, 150].map(r => `<path d="M12 3.5V20.5" transform="rotate(${r} 12 12)"/>`).join('')}</g></svg>`;
    if (f.includes('hermes') || f.includes('nous')) return `<svg class="ai-logo" role="img" aria-label="Hermes" width="24" height="24" viewBox="0 0 24 24"><path d="M5 18 L12 4 L19 18 Z M9 13 H15" fill="none" stroke="#0a1230" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    return `<svg class="ai-logo" role="img" aria-label="IA ainda não definida" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#9aa3c2" stroke-width="1.7" stroke-dasharray="3 3"/><path d="M10 9.5a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1v.5M12 15.5v.3" fill="none" stroke="#9aa3c2" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  }
  function lastTrackFor(slug) {
    let found = null;
    tracks.forEach(t => { if (t.to === slug || t.from === slug) found = t.id; });
    return found;
  }
  function renderDrawer() {
    const d = $('drawerBody'), foot = $('drawerFoot');
    if (!selected) return;
    const act = actors.get(selected); if (!act || !act.a) return;
    const a = act.a, st = act.status, isCmd = mode === 'commander';
    const idx = D.AGENTS.findIndex(x => x.slug === a.slug);
    if (!draft || draft.slug !== a.slug) draft = { slug: a.slug, look: { ...act.look } };
    const look = draft.look;
    const changed = JSON.stringify(look) !== JSON.stringify(act.look);
    if (drTab === 'tarefas' && !isCmd) drTab = 'sobre';
    const strict = /aprova|sim/i.test(a.guardrailBadge || '');
    const facts = [
      ['ia', 'IA', a.primaryModelFamily || 'a definir', false],
      ['rule', 'Regra', a.guardrailBadge || '—', strict],
      ['seen', 'Visto', a.lastActiveRelative || '—', false]
    ];
    const approval = act.pending ? `<div class="dh-approval" role="alert">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M10 6v5M10 13.8v.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
        <div><b>${esc(act.pending.title)}</b><span>${esc(act.pending.detail)}</span>
        ${isCmd ? '<div class="row"><button type="button" class="btn-dark" data-decide="1">Aprovar</button><button type="button" class="btn-line" data-decide="0">Recusar</button></div>' : ''}</div>
      </div>` : '';

    $('drawerHead').innerHTML = `
      <div class="dh-top" style="--body:${look.body}">
        <div class="dr-nav">
          <button type="button" class="icon-btn" data-nav="-1" aria-label="Agente anterior">${icon('left')}</button>
          <span class="dr-count">${idx + 1} de ${D.AGENTS.length}</span>
          <button type="button" class="icon-btn" data-nav="1" aria-label="Próximo agente">${icon('right')}</button>
          <button type="button" class="icon-btn close" data-close aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="dh-id">
          <div class="dh-portrait st-${st}">${olheiroStandalone(look, 72)}</div>
          <div class="dh-txt">
            <span class="dh-room">${esc(a.room)}</span>
            <h2 class="dh-name">${esc(a.shortName)}</h2>
            <span class="dh-chip s-${st}"><i></i>${ST_CHIP[st]}${st === 'working' ? ` · ${esc(a.workingLabel)}` : ''}</span>
          </div>
        </div>
      </div>
      <div class="dh-tabs" role="tablist">
        ${[['sobre', 'Sobre'], ['visual', 'Visual'], ['tarefas', 'Tarefas']].map(([k, l]) => {
          const locked = k === 'tarefas' && !isCmd;
          return `<button type="button" role="tab" data-tab="${k}" aria-selected="${drTab === k}" ${locked ? 'aria-disabled="true" title="Só no modo Comandante"' : ''} class="${locked ? 'locked' : ''}">${l}${locked ? icon('lock') : ''}</button>`;
        }).join('')}
      </div>`;

    let body = '', footer = '';
    if (drTab === 'sobre') {
      body = `<p class="dh-sum">${esc(a.publicSummary)}</p>
        <div class="dh-facts">${facts.map(([ic, k, v, hot]) => `<div class="${hot ? 'hot' : ''} ${ic === 'ia' ? 'is-ia' : ''}">${ic === 'ia' ? aiLogo(a.primaryModelFamily) : `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">${FACT_ICON[ic]}</svg>`}<span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
        ${approval}
        ${a.slug === 'curador-threads-links' ? `<div class="dh-sec"><h3 class="dr-h">Lendo esta semana</h3><ul class="feed">${D.CURATED_FEED.map(f => `
          <li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.title)}${icon('ext')}</a><span class="feed-meta">${esc(f.source)} · ${esc(f.date)}</span></li>`).join('')}</ul></div>` : ''}
        <p class="dr-note">Público: nome, função, sala e se está ocupado. Nunca conversas ou senhas.</p>`;
      const trk = lastTrackFor(a.slug);
      footer = `<button type="button" class="btn-line" data-goroom>Ver na sala</button>
        <button type="button" class="btn-dark" data-track-open ${trk ? `data-id="${trk}"` : 'disabled title="Ainda não passou nenhum pedido por aqui"'}>Rastrear pedido</button>`;
    } else if (drTab === 'visual') {
      const chip = (part, key, label, art) => `<button type="button" class="wr-chip ${look[part] === key ? 'on' : ''}" data-wr="${part}" data-v="${key}" aria-pressed="${look[part] === key}">${art}<span>${esc(label)}</span></button>`;
      body = `<div class="dh-stage" style="--body:${look.body}">${olheiroStandalone(look, 112)}${changed ? '<span class="dr-preview">prévia</span>' : ''}</div>
        ${isCmd ? '' : `<p class="wr-hint2">${icon('lock')}Pode experimentar à vontade. Só o Comandante veste de verdade.</p>`}
        <p class="wr-label">Cor</p><div class="wr-row">${W8.bodies.map(c => `<button type="button" class="sw ${look.body === c ? 'on' : ''}" data-wr="body" data-v="${c}" style="--c:${c}" aria-label="Cor ${c}" aria-pressed="${look.body === c}"></button>`).join('')}</div>
        <p class="wr-label">Chapéu</p><div class="wr-row">${W8.hats.map(h => chip('hat', h.key, h.label, h.key === 'none' ? '<i class="wr-none"></i>' : `<svg viewBox="4 4 92 54" aria-hidden="true">${hatSvg(h.key, h.key === look.hat ? look.hatColor : h.color)}</svg>`)).join('')}</div>
        <p class="wr-label">Roupa</p><div class="wr-row">${W8.outfits.map(o => chip('outfit', o.key, o.label, `<svg viewBox="-2 26 104 110" aria-hidden="true">${olheiroInner({ body: look.body, hat: 'none', hatColor: '#000', outfit: o.key, outfitColor: look.outfitColor })}</svg>`)).join('')}</div>
        <p class="wr-label">Cor da roupa</p><div class="wr-row">${W8.outfitColors.map(c => `<button type="button" class="sw ${look.outfitColor === c ? 'on' : ''}" data-wr="outfitColor" data-v="${c}" style="--c:${c}" aria-label="Cor da roupa ${c}" aria-pressed="${look.outfitColor === c}"></button>`).join('')}</div>`;
      footer = `<button type="button" class="btn-line" data-wr-reset>Original</button>
        <button type="button" class="btn-dark grow" data-wr-apply ${isCmd && changed ? '' : 'disabled'}>${isCmd ? 'Vestir' : icon('lock') + 'Só o Comandante veste'}</button>`;
    } else {
      const del = deliveries[a.slug] || [];
      body = `${approval}
        <form id="cmdForm" class="cmd">
          <label for="cmdInput" class="wr-label">O que ${esc(a.shortName)} deve fazer?</label>
          <textarea id="cmdInput" rows="3" placeholder="Ex.: ${esc(a.quickPrompts[0])}"></textarea>
          <div class="chips">${a.quickPrompts.map(p => `<button type="button" class="chip" data-quick="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        </form>
        <p class="wr-label">Últimas entregas</p>
        ${del.length ? `<ul class="deliv">${del.map(x => `<li><span class="deliv-t">${esc(x.text)}</span><span class="deliv-st st-${x.state.replace(/\s/g, '-')}">${esc(x.state)}</span></li>`).join('')}</ul>` : '<p class="dr-muted">Nenhuma entrega ainda.</p>'}
        <p class="dr-note">Prévia. Na versão de verdade só você entra, e qualquer coisa arriscada pede sua confirmação.</p>`;
      footer = `<button type="submit" form="cmdForm" class="btn-dark grow">${icon('send')}${you ? 'Entregar em mãos' : 'Enviar tarefa'}</button>`;
    }

    const keepScroll = d.scrollTop;
    d.innerHTML = body;
    d.scrollTop = keepScroll;
    foot.innerHTML = footer;

    $('drawerHead').querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('locked')) return;
      if (drTab !== b.dataset.tab) { drTab = b.dataset.tab; d.scrollTop = 0; renderDrawer(); }
    }));
    $('drawerHead').querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
      const n = (idx + Number(b.dataset.nav) + D.AGENTS.length) % D.AGENTS.length;
      select(D.AGENTS[n].slug, true);
    }));
    $('drawerHead').querySelector('[data-close]').addEventListener('click', closeDrawer);
    d.querySelectorAll('[data-wr]').forEach(b => b.addEventListener('click', () => tryOn(a, b.dataset.wr, b.dataset.v)));
    d.querySelectorAll('[data-decide]').forEach(b => b.addEventListener('click', () => decide(a.slug, b.dataset.decide === '1')));
    d.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => { const i = $('cmdInput'); i.value = b.dataset.quick; i.focus(); }));
    const f = $('cmdForm');
    if (f) f.addEventListener('submit', e => { e.preventDefault(); const i = $('cmdInput'); const t = i.value.trim(); if (!t) { i.focus(); return; } dispatchTask(a.slug, t); i.value = ''; });
    const ap = foot.querySelector('[data-wr-apply]'); if (ap) ap.addEventListener('click', () => applyLook(a.slug));
    const rs = foot.querySelector('[data-wr-reset]'); if (rs) rs.addEventListener('click', () => resetLook(a.slug));
    const gr = foot.querySelector('[data-goroom]'); if (gr) gr.addEventListener('click', () => { const r = D.ROOMS.find(x => x.key === a.roomKey); if (r) isolateRoom(r); });
    const tk = foot.querySelector('[data-track-open][data-id]'); if (tk) tk.addEventListener('click', () => openTrack(tk.dataset.id));
  }

  // ───────── guarda-roupa
  // Comandante troca e salva; Visitante só experimenta na prévia.
  let draft = null;
  const W8 = D.WARDROBE;
  const LOOKS_KEY = 'agent-office.looks.v1';
  const originalLook = slug => ({ outfit: 'none', outfitColor: '#0a1230', ...D.AGENTS.find(x => x.slug === slug).look });
  function readLooks() { try { return JSON.parse(localStorage.getItem(LOOKS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function writeLooks(v) { try { localStorage.setItem(LOOKS_KEY, JSON.stringify(v)); } catch (e) { /* sem armazenamento: vale só nesta aba */ } }
  function validLook(l) {
    return l && W8.bodies.includes(l.body) && W8.hats.some(h => h.key === l.hat) && W8.outfits.some(o => o.key === l.outfit) &&
      W8.outfitColors.includes(l.outfitColor) && /^#[0-9a-f]{6}$/i.test(l.hatColor || '');
  }
  function loadLooks() {
    const saved = readLooks();
    actors.forEach(act => { if (act.a && validLook(saved[act.slug])) { act.look = { ...saved[act.slug] }; dressActor(act); } });
  }
  function tryOn(a, part, v) {
    const l = draft.look;
    if (part === 'hat') { l.hat = v; const orig = originalLook(a.slug); l.hatColor = v === orig.hat ? orig.hatColor : W8.hats.find(h => h.key === v).color; }
    else l[part] = v;
    renderDrawer();
  }
  function applyLook(slug) {
    if (mode !== 'commander') return;
    const act = actors.get(slug);
    act.look = { ...draft.look };
    dressActor(act); impact(act);
    const saved = readLooks(); saved[slug] = act.look; writeLooks(saved);
    say(act, 'Gostei do visual novo.');
    traceEv('local', `Visual de ${act.a.shortName} salvo`, 'localStorage · agent-office.looks.v1 (vale só neste navegador)', 'local');
    renderDrawer();
  }
  function resetLook(slug) {
    draft.look = originalLook(slug);
    if (mode === 'commander') {
      const act = actors.get(slug); act.look = { ...draft.look }; dressActor(act);
      const saved = readLooks(); delete saved[slug]; writeLooks(saved);
    }
    renderDrawer();
  }
  function setMode(m) {
    mode = m;
    draft = null;
    document.body.dataset.mode = m;
    $('modeVisitor').setAttribute('aria-pressed', m === 'visitor');
    $('modeCommander').setAttribute('aria-pressed', m === 'commander');
    $('heroSub').textContent = m === 'visitor'
      ? 'Os agentes de IA que tocam meus projetos, cada um na sua sala. Clique num agente ou no chão de uma sala pra conhecer.'
      : 'Experimente tarefas e aprovações fictícias no mapa.';
    if (m === 'commander') spawnYou(); else despawnYou();
    renderMoon();
    renderDrawer();
  }

  // ───────────────────────── easter egg: a lua tem olho (só no modo Visitante)
  const moon = { look: [0, 0], blinkT: 3, lookUpT: 0, clicks: 0, clickT: 0, sayT: null };
  function renderMoon() {
    const el = $('moon'); if (!el) return;
    const sun = ['day', 'dawn'].includes(document.body.dataset.sky);
    el.innerHTML = moonSvg(44, mode === 'visitor', sun) + '<span class="moon-say" id="moonSay"></span>';
    el.setAttribute('aria-label', mode === 'visitor' ? 'A lua está de olho' : 'A lua está dormindo');
    moon.pupil = el.querySelector('.moon-pupil');
    moon.lid = el.querySelector('.moon-lid');
  }
  function moonSay(text, ms = 1800) {
    const s = $('moonSay'); if (!s) return;
    s.textContent = text; s.classList.remove('on'); void s.offsetWidth; s.classList.add('on');
    clearTimeout(moon.sayT); moon.sayT = setTimeout(() => s.classList.remove('on'), ms);
  }
  function moonWink() { moon.blinkT = -0.0001; }
  function moonClick() {
    if (mode !== 'visitor') { moonSay('zzz…'); return; }
    moon.clicks = moon.clickT > 0 ? moon.clicks + 1 : 1;
    moon.clickT = 1.6;
    moonWink();
    if (moon.clicks < 3) {
      if (moon.clicks === 1 && moon.eggDone) { moonSay('Psiu… digita “viu”.', 2400); return; }
      moonSay(moon.clicks === 1 ? 'Viu?' : 'Viu de novo?'); return;
    }
    moon.eggDone = true;
    moon.clicks = 0;
    moonSay('Eu vejo tudo daqui de cima.', 2600);
    shootingStar();
    moon.lookUpT = 3.2;
    actors.forEach(a => impact(a));
    const viu = actors.get('viu-mercado-adocao');
    if (viu) say(viu, 'A lua tá olhando a gente.');
    log.push({ who: 'Lua', color: '#fff3c9', text: 'Eu vejo tudo daqui de cima.', t: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date()) });
    renderLog();
  }
  function shootingStar() {
    if (REDUCED) return;
    const s = document.createElement('i');
    s.className = 'shooting-star';
    document.querySelector('.sky').appendChild(s);
    setTimeout(() => s.remove(), 1500);
  }
  function tickMoon(dt) {
    if (!moon.pupil) return;
    if (moon.clickT > 0) moon.clickT -= dt;
    if (moon.lookUpT > 0) moon.lookUpT -= dt;
    moon.blinkT -= dt;
    let lid = 0;
    if (moon.blinkT < 0) { lid = 17; if (moon.blinkT < -0.14) moon.blinkT = 2.8 + Math.random() * 4; }
    moon.lid.setAttribute('height', lid);
    const [lx, ly] = moon.lookUpT > 0 ? [-2.4, 1.6] : moon.look;
    moon.pupil.setAttribute('transform', `translate(${lx.toFixed(2)} ${ly.toFixed(2)})`);
  }
  window.addEventListener('pointermove', e => {
    const el = $('moon'); if (!el || mode !== 'visitor') return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
    moon.look = [dx / d * 2.6 * k, dy / d * 2.2 * k];
  });

  // relógio da parede e do topo: hora de São Paulo, ponteiro de segundos andando
  const clockFmt = new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', minute: 'numeric', second: 'numeric', timeZone: 'America/Sao_Paulo', hourCycle: 'h23' });
  function tickClock() {
    const parts = Object.fromEntries(clockFmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    const h = +parts.hour, m = +parts.minute, sec = +parts.second;
    const txt = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    const c = $('clock'); if (c.textContent !== txt) c.textContent = txt;
    const hh = $('clkH'), mm = $('clkM'), ss = $('clkS');
    if (hh) {
      hh.setAttribute('transform', `rotate(${(h % 12) * 30 + m * 0.5 + sec / 120} 16 16)`);
      mm.setAttribute('transform', `rotate(${m * 6 + sec * 0.1} 16 16)`);
      if (ss) ss.setAttribute('transform', `rotate(${sec * 6} 16 16)`);
    }
  }

  // ───────────────────────── eventos
  function bind() {
    $('scenes').addEventListener('click', e => {
      const sb = e.target.closest('[data-scene]');
      if (sb) {
        const k = sb.dataset.scene;
        if (scene && scene.def.key === k && !scene.done) { worldPaused = !worldPaused; renderScenes(); return; }
        startScene(k); return;
      }
      const ab = e.target.closest('[data-act]'); if (!ab) return;
      const act = ab.dataset.act;
      if (act === 'pause') { worldPaused = !worldPaused; renderScenes(); }
      if (act === 'next') { nextStep(); }
      if (act === 'replay') startScene(sceneDef(scene.def.key) ? scene.def.key : scene.def);
      if (act === 'stop') { stopScene(); resetWorld(false); }
    });
    $('moon').addEventListener('click', moonClick);
    $('askForm').addEventListener('submit', e => { e.preventDefault(); const i = $('askInput'); const t = i.value.trim().slice(0, 140); if (!t) { i.focus(); return; } ask(t); });
    $('askForm').querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => { $('askInput').value = b.dataset.ask; ask(b.dataset.ask); }));
    $('tourBtn').addEventListener('click', startTour);
    $('tourExit').addEventListener('click', endTour);
    window.addEventListener('keydown', secretKey);
    $('menuBtn').addEventListener('click', () => {
      if (isPhone()) setMenu(!document.body.classList.contains('menu-open'));
      else setRoomOnly(!document.body.classList.contains('room-only'));
    });
    $('menuVeil').addEventListener('click', () => setMenu(false));
    // no celular, escolher algo no menu fecha a folha pra mostrar o mapa
    $('side').addEventListener('click', e => { if (isPhone() && e.target.closest('[data-scene], [data-act="replay"], #tourBtn, #hoodToggle')) setMenu(false); });
    $('askForm').addEventListener('submit', () => { if (isPhone()) setTimeout(() => setMenu(false), 600); });
    syncMenuBtn();
    window.addEventListener('resize', syncMenuBtn);
    $('coachNext').addEventListener('click', nextGuide);
    $('coachSkip').addEventListener('click', endGuide);
    $('helpBtn').addEventListener('click', () => { $('legendPop').hidden = true; startGuide(); });
    $('legendClose').addEventListener('click', () => { $('legendPop').hidden = true; renderIsland(); });
    $('tabHood').addEventListener('click', () => setTab('hood'));
    $('tabChat').addEventListener('click', () => setTab('chat'));
    $('btnReset').addEventListener('click', () => { resetWorld(true); if (selected) renderDrawer(); });
    $('modeVisitor').addEventListener('click', () => setMode('visitor'));
    $('modeCommander').addEventListener('click', () => setMode('commander'));
    $('zoomIn').addEventListener('click', () => zoomBy(1.45));
    $('zoomOut').addEventListener('click', () => zoomBy(1 / 1.45));
    $('zoomFit').addEventListener('click', () => { if (isolated) isolateRoom(null); setCam(fitCam(), 380); });
    $('hoodToggle').addEventListener('click', () => openHood($('hoodPanel').hidden));
    $('hoodClose').addEventListener('click', () => openHood(false));

    // arrastar / clicar no chão
    let drag = null;
    const touches = new Map(); let pinch = null;
    const pinchInfo = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    stageWrap.addEventListener('pointerdown', e => {
      if (e.target.closest('.ui-float, .drawer')) return;
      // pinça só com toques reais na tela (mouse e caneta nunca contam como "segundo dedo")
      if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { drag = null; const p = pinchInfo(); pinch = { ...p, s: cam.s, cx: cam.x, cy: cam.y }; camTween = null; return; }
      drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false, id: e.pointerId };
    });
    const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
    window.addEventListener('pointercancel', endTouch);
    window.addEventListener('blur', () => { touches.clear(); pinch = null; });
    window.addEventListener('pointermove', e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const p = pinchInfo(), r = stageWrap.getBoundingClientRect();
        const s = clamp(pinch.s * p.d / pinch.d, ZMIN, ZMAX);
        const ox = pinch.mx - r.left, oy = pinch.my - r.top;
        const wx = (ox - pinch.cx) / pinch.s, wy = (oy - pinch.cy) / pinch.s;
        cam = { s, x: (p.mx - r.left) - wx * s, y: (p.my - r.top) - wy * s }; applyCam();
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; stageWrap.classList.add('is-dragging'); camTween = null; }
      if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; applyCam(); }
    });
    window.addEventListener('pointerup', e => {
      endTouch(e);
      if (!drag || e.pointerId !== drag.id) return;
      const wasDrag = drag.moved; drag = null; stageWrap.classList.remove('is-dragging');
      if (wasDrag) return;
      if (e.target.closest('.actor, .ui-float, .drawer')) return;
      const r = stageWrap.getBoundingClientRect();
      const [tx, ty] = screenToTile(e.clientX - r.left, e.clientY - r.top);
      if (mode === 'commander' && you && walkable(tx, ty)) { walkTo(you, tx, ty, null, true); }
      else if (selected) closeDrawer();
      else if (mode === 'visitor' && !tour) {
        const r = inside(tx, ty) ? roomAt(tx, ty) : null;
        if (isolated && (!r || r.key !== isolated.key)) isolateRoom(null);
        else if (!isolated && r && r.key !== 'hall') isolateRoom(r);
      }
    });
    stageWrap.addEventListener('dblclick', e => {
      if (e.target.closest('.actor, .ui-float, .drawer')) return;
      if (mode === 'visitor' && !isolated) return;
      const r = stageWrap.getBoundingClientRect();
      zoomBy(e.shiftKey ? 1 / 1.7 : 1.7, e.clientX - r.left, e.clientY - r.top);
    });
    stageWrap.addEventListener('wheel', e => {
      // rolar a ficha, o painel e os cartões nunca vira zoom do mapa
      if (e.target.closest('.drawer, .hood-panel, .ui-float')) return;
      if (window.innerWidth <= 900 && !e.ctrlKey) return;
      e.preventDefault();
      const r = stageWrap.getBoundingClientRect();
      zoomBy(Math.exp(-clamp(e.deltaY, -60, 60) * 0.004), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target.matches && e.target.matches('textarea, input')) return;
      if (e.key === 'Escape' && !$('coach').hidden) { endGuide(); return; }
      if (e.key === 'Escape' && !$('legendPop').hidden) { $('legendPop').hidden = true; renderIsland(); return; }
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); return; }
      if (e.key === 'Escape' && tour) { endTour(); return; }
      if (e.key === 'Escape' && debugOn) { toggleDebug(); return; }
      if (e.key === 'Escape' && selected) closeDrawer();
      else if (e.key === 'Escape' && isolated) isolateRoom(null);
      else if (e.key === 'Escape' && document.body.classList.contains('room-only')) setRoomOnly(false);
      if (e.key === 'f' || e.key === 'F') setRoomOnly(!document.body.classList.contains('room-only'));
      if (e.key === '+' || e.key === '=') zoomBy(1.45);
      if (e.key === '-' || e.key === '_') zoomBy(1 / 1.45);
      if (e.key === '0') setCam(fitCam(), 380);
      if (selected && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const idx = D.AGENTS.findIndex(x => x.slug === selected);
        const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + D.AGENTS.length) % D.AGENTS.length;
        select(D.AGENTS[n].slug, true);
      }
    });
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => reframe(0), 80); });
  }

  function pingTile(tx, ty) {
    const g = document.createElementNS(NS, 'polygon');
    g.setAttribute('points', P(iso(tx, ty), iso(tx + 1, ty), iso(tx + 1, ty + 1), iso(tx, ty + 1)));
    g.setAttribute('class', 'tile-ping');
    $('lGlow').appendChild(g);
    setTimeout(() => g.remove(), 700);
  }

  // placas das salas (como no Habbo: nome + quem está lá)
  const roomTags = [];
  function buildRoomTags() {
    D.ROOMS.filter(r => r.key !== 'hall').forEach(r => {
      const el = document.createElement('div');
      el.className = 'room-tag';
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.setAttribute('aria-label', `Enquadrar ${r.name}`);
      const go = e => { e.stopPropagation(); if (isolated && isolated.key === r.key) isolateRoom(null); else isolateRoom(r); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
      el.addEventListener('pointerdown', e => e.stopPropagation());
      const n = D.AGENTS.filter(a => a.roomKey === r.key).length;
      el.innerHTML = `<b>${esc(r.name)}</b><span>${n} ${n === 1 ? 'agente' : 'agentes'} · ${esc(r.proof)}</span>`;
      overlay.appendChild(el);
      roomTags.push({ el, key: r.key, at: iso(r.x0 + 0.35, r.y1 + 1 - 0.35) });
    });
  }
  // a câmera sempre volta pro que está em foco: sala isolada, agente aberto ou o andar
  function reframe(ms = 380) {
    if (isolated) focusRoom(isolated, ms);
    else if (selected) focusOn(selected);
    else setCam(homeCam(), ms);
  }
  // enquadra uma sala só (clique no nome dela)
  function focusRoom(r, ms = 480) {
    if (selected) { selected = null; document.body.classList.remove('drawer-open'); }
    setCam(roomCam(r), ms);
  }
  function roomCam(r) {
    const zt = r.x0 === 0 || r.y0 === 0 ? WALL_H : 70;
    const pts = [iso(r.x0, r.y0, zt), iso(r.x1 + 1, r.y0, zt), iso(r.x0, r.y1 + 1, -SLAB), iso(r.x1 + 1, r.y1 + 1, -SLAB), iso(r.x0, r.y0 - 0.0, zt), iso(r.x0 - 0.2, r.y1 + 1, zt)];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const size = stageSize(), h = size.h, pad = 48, top = 70;
    // o cartão da sala ocupa a direita no desktop: a sala centraliza no espaço que sobra
    const w = size.w - (!selected && window.innerWidth > 900 ? 380 : 0);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const s = clamp(Math.min((w - pad * 2) / bw, (h - top - pad) / bh), ZMIN, 2.4);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    return { s, x: w / 2 - cx * s, y: top + (h - top) / 2 - cy * s };
  }

  // ───────── cartão da sala: o que ela faz, a regra e quem está lá
  function renderRoomCard() {
    const el = $('roomCard'); if (!el) return;
    const r = isolated;
    if (!r) { el.hidden = true; return; }
    const people = D.AGENTS.filter(a => a.roomKey === r.key).map(a => actors.get(a.slug)).filter(Boolean);
    const working = people.filter(p => p.status === 'working').length;
    const waiting = people.filter(p => p.status === 'waiting').length;
    el.hidden = false;
    el.style.setProperty('--accent', r.accent || '#a9b3d9');
    el.innerHTML = `
      <p class="rc-k"><i></i>Sala</p>
      <h2 class="rc-name">${esc(r.name)}</h2>
      <p class="rc-sum">${esc(r.summary || '')}</p>
      <div class="rc-stats">
        <span><b>${people.length}</b> ${people.length === 1 ? 'agente' : 'agentes'}</span>
        <span><b>${working}</b> trabalhando</span>
        ${waiting ? `<span class="alert"><b>${waiting}</b> esperando você</span>` : ''}
      </div>
      ${r.proof ? `<p class="rc-rule"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20"><path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>${esc(r.proof)}</p>` : ''}
      ${people.length ? `<ul class="rc-people">${people.map(p => `<li><button type="button" data-agent="${esc(p.slug)}">
        <span class="rc-av">${olheiroStandalone(p.look, 30)}</span>
        <span class="rc-who"><b>${esc(p.a.shortName)}</b><span>${esc(p.a.roleTitle)}</span></span>
        <i class="d d-${p.status}" title="${STATUS_LABEL[p.status]}"></i></button></li>`).join('')}</ul>` : ''}`;
    el.querySelectorAll('[data-agent]').forEach(b => b.addEventListener('click', () => select(b.dataset.agent, true)));
  }

  // ───────── isolar uma sala: some o resto do andar, fica só ela (com chão, paredes e quem está lá)
  let isolated = null;
  function isolateRoom(r) {
    isolated = r;
    document.body.classList.toggle('isolated', !!r);
    const cam = $('cam');
    ['lBase', 'lGlow', 'lPath', 'lWalls'].forEach(id => $(id).removeAttribute('clip-path'));
    $('lWalls').style.display = '';
    const old = $('roomSlab'); if (old) old.remove();
    ['clipFloor', 'clipPrism'].forEach(id => { const c = $(id); if (c) c.remove(); });
    furniture.forEach(f => { f.node.style.display = !r || f.rooms.includes(r.key) ? '' : 'none'; });
    roomTags.forEach(t => { t.el.style.display = !r || t.key === r.key ? '' : 'none'; t.el.classList.toggle('is-on', !!r && t.key === r.key); });
    renderIsland();
    renderRoomCard();
    if (!r) { setCam(homeCam(), 480); renderIsland(); return; }

    const m = 0.04, x0 = r.x0 - m, y0 = r.y0 - m, x1 = r.x1 + 1 + m, y1 = r.y1 + 1 + m, Z = WALL_H + 24;
    const floor = P(iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1));
    // recorte da parede: só o trecho que fica atrás desta sala (com o tampo)
    const walls = [];
    if (r.y0 === 0) { const xa = r.x0 - (r.x0 === 0 ? 0.3 : 0), xb = r.x1 + 1; walls.push(P(iso(xa, 0, -2), iso(xb, 0, -2), iso(xb, -0.3, Z), iso(xa - 0.3, -0.3, Z))); }
    if (r.x0 === 0) { const ya = r.y0 - (r.y0 === 0 ? 0.3 : 0), yb = r.y1 + 1; walls.push(P(iso(0, ya, -2), iso(0, yb, -2), iso(-0.3, yb, Z), iso(-0.3, ya - 0.3, Z))); }
    const defs = document.createElementNS(NS, 'g');
    defs.id = 'isoClips';
    defs.innerHTML = `<clipPath id="clipFloor"><polygon points="${floor}"/></clipPath><clipPath id="clipPrism">${walls.map(w => `<polygon points="${w}"/>`).join('')}</clipPath>`;
    svg.querySelector('defs').appendChild(defs.firstChild); svg.querySelector('defs').appendChild(defs.firstChild);
    ['lBase', 'lGlow', 'lPath'].forEach(id => $(id).setAttribute('clip-path', 'url(#clipFloor)'));
    // parede do fundo só aparece se a sala encosta nela
    if (r.x0 === 0 || r.y0 === 0) $('lWalls').setAttribute('clip-path', 'url(#clipPrism)'); else $('lWalls').style.display = 'none';
    // laje própria: a sala vira uma maquete solta
    const slab = document.createElementNS(NS, 'g');
    slab.id = 'roomSlab';
    const X0 = r.x0, Y0 = r.y0, X1 = r.x1 + 1, Y1 = r.y1 + 1;
    const mid = iso((X0 + X1) / 2, (Y0 + Y1) / 2), span = (X1 - X0 + Y1 - Y0) * 16;
    slab.innerHTML = `<ellipse cx="${mid[0]}" cy="${mid[1] + SLAB + 30}" rx="${span * 1.25}" ry="${span * 0.55}" fill="url(#gUnder)"/>
      <ellipse cx="${mid[0]}" cy="${mid[1] + SLAB + 14}" rx="${span * 0.95}" ry="${span * 0.32}" fill="#030718" opacity=".45"/>
      <polygon points="${P(iso(X0, Y1), iso(X1, Y1), iso(X1, Y1, -SLAB), iso(X0, Y1, -SLAB))}" fill="#0e1a48"/>
      <polygon points="${P(iso(X1, Y0), iso(X1, Y1), iso(X1, Y1, -SLAB), iso(X1, Y0, -SLAB))}" fill="#0a1438"/>
      <polyline points="${P(iso(X0, Y1), iso(X1, Y1), iso(X1, Y0))}" fill="none" stroke="${r.accent || '#2f4a9a'}" stroke-opacity=".7" stroke-width="1.6"/>`;
    $('lBase').before(slab);
    $('isoName').textContent = r.name;
    const n = D.AGENTS.filter(a => a.roomKey === r.key).length;
    $('isoMeta').textContent = `${n} ${n === 1 ? 'agente' : 'agentes'}${r.proof ? ' · ' + r.proof : ''}`;
    focusRoom(r);
    traceEv('local', `Olhando só a ${r.name}`, `${furniture.filter(f => f.rooms.includes(r.key)).length} peças da sala, o resto do andar escondido`, 'local', 'planta');
  }
  // modo "só a sala": some com os painéis, fica o escritório
  // celular: o menu é uma folha que sobe de baixo
  const isPhone = () => window.innerWidth <= 900;
  function setMenu(on) {
    document.body.classList.toggle('menu-open', on);
    syncMenuBtn();
    const mb = $('menuBtn'); mb.classList.remove('pop'); void mb.offsetWidth; mb.classList.add('pop');
  }
  function syncMenuBtn() {
    const mb = $('menuBtn');
    const open = isPhone() ? document.body.classList.contains('menu-open') : !document.body.classList.contains('room-only');
    mb.setAttribute('aria-expanded', open);
    mb.setAttribute('aria-label', isPhone() ? (open ? 'Fechar o menu' : 'Abrir o menu') : (open ? 'Esconder o painel (F)' : 'Mostrar o painel (F)'));
  }
  function setRoomOnly(on) {
    document.body.classList.toggle('room-only', on);
    const mb = $('menuBtn');
    mb.setAttribute('aria-expanded', !on);
    mb.setAttribute('aria-label', on ? 'Mostrar o painel (F)' : 'Esconder o painel (F)');
    mb.classList.remove('pop'); void mb.offsetWidth; mb.classList.add('pop');
    if (on && selected) { selected = null; document.body.classList.remove('drawer-open'); }
    // o mapa cresce junto com o painel saindo; a câmera acompanha no fim do deslize
    slideUntil = performance.now() + (REDUCED ? 0 : 560);
    clearTimeout(setRoomOnly.t);
    setRoomOnly.t = setTimeout(() => reframe(240), REDUCED ? 0 : 580);
  }
  function placeRoomTags() { roomTags.forEach(t => { const p = toScreen(t.at[0], t.at[1]); t.el.style.translate = `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`; }); }

  let liveOn = false, reloadWhenIdle = false;
  function applyLive(live) {
    if (!live) { liveOn = false; return; }
    D.AGENTS.forEach(a => {
      const x = live.bySlug.get(a.slug); if (!x) return;
      a.status = x.status;
      a.lastActiveRelative = x.lastActiveRelative ?? 'há mais tempo';
      if (a.pendingApproval && x.status !== 'waiting') a.pendingApproval = null;
      const act = actors.get(a.slug);
      if (act && !scene && !act.busy && act.status !== x.status) { setStatus(a.slug, x.status, 'live'); act.pending = a.pendingApproval ? { ...a.pendingApproval } : null; }
    });
    liveOn = true;
  }
  const idleNow = () => !scene && !selected && !(you && you.path.length) && !document.querySelector('textarea:focus');
  function traceFetch(live) {
    const f = lastFetch; if (!f) return;
    if (live) {
      const w = D.AGENTS.filter(a => a.status === 'working').length;
      traceEv('rede', `Leu o estado público: ${f.n} agentes, ${w} trabalhando`, `GET /api/public/state → ${f.code} · ${f.ms} ms`, 'live');
    } else {
      traceEv('rede', 'Sem dados recentes do servidor: mostrando uma simulação', `GET /api/public/state → ${f.code}`, 'sim');
    }
  }
  async function pullLive() {
    const live = await fetchLive(8000);
    applyLive(live);
    traceFetch(live);
    if (live) {
      // grupo novo apareceu (ou sumiu)? a planta precisa ser refeita
      const have = D.AGENTS.filter(a => !BASE_SLUGS.has(a.slug)).map(a => a.slug).sort().join();
      const now = live.extras.map(a => a.slug).sort().join();
      if (have !== now) reloadWhenIdle = true;
    }
    if (reloadWhenIdle && idleNow()) { location.reload(); return; }
    renderIsland();
    if (selected) renderDrawer();
  }

  // ───────────────────────── rastreio de pedido (de ponta a ponta)
  let simT = 0;
  const tracks = new Map();
  let trackShown = null;
  const TRACK_STEPS = [
    { k: 'saiu', label: 'Pedido criado' },
    { k: 'chegou', label: 'Chegou na fila' },
    { k: 'trabalhando', label: 'Em andamento' },
    { k: 'pronto', label: 'Resposta pronta' }
  ];
  function trackNew(from, to, text) {
    const id = newId();
    const fromName = from === 'voce' ? 'Você' : shortOf(from);
    tracks.set(id, { id, from, to, fromName, toName: shortOf(to), text, t0: simT, stages: [{ k: 'saiu', label: `${fromName} criou o pedido`, tech: `POST /v1/agents/${to}/messages → 202`, at: simT }] });
    openDeliveries.set(to, id);
    if (tracks.size > 30) tracks.delete(tracks.keys().next().value);
    openTrack(id);
    return id;
  }
  function trackStage(id, k, label, tech) {
    const t = tracks.get(id); if (!t || t.stages.some(s => s.k === k)) return;
    t.stages.push({ k, label, tech, at: simT });
    if (trackShown === id) renderTrack();
  }
  function openTrack(id) { if (!tracks.has(id)) return; trackShown = id; renderTrack(); }
  function closeTrack() { trackShown = null; $('track').hidden = true; }
  const secs = v => (v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)) + ' s';
  function renderTrack() {
    const el = $('track'); const t = tracks.get(trackShown);
    if (!t) { el.hidden = true; return; }
    el.hidden = false;
    const waiting = t.stages.find(s => s.k === 'aprov');
    const steps = waiting ? [...TRACK_STEPS.slice(0, 3), { k: 'aprov', label: 'Esperando aprovação' }] : TRACK_STEPS;
    const done = new Map(t.stages.map(s => [s.k, s]));
    const lastIdx = Math.max(...steps.map((s, i) => done.has(s.k) ? i : -1));
    const end = done.get('pronto') || done.get('aprov');
    el.innerHTML = `
      <div class="trk-head"><span class="trk-k">Rastreio</span><code>${esc(t.id)}</code><button type="button" class="trk-x" aria-label="Fechar rastreio">${icon('x')}</button></div>
      <p class="trk-route"><b>${esc(t.fromName)}</b> → <b>${esc(t.toName)}</b></p>
      <ol class="trk-steps">${steps.map((s, i) => {
        const st = done.get(s.k);
        const cls = st ? (i === lastIdx && !end ? 'now' : 'ok') : 'todo';
        return `<li class="${cls} ${s.k === 'aprov' ? 'warn' : ''}"><i></i><div><b>${esc(st ? st.label : s.label)}</b>${st ? `<span>+${secs(st.at - t.t0)}${st.tech ? ' · <code>' + esc(st.tech) + '</code>' : ''}</span>` : '<span>aguardando</span>'}</div></li>`;
      }).join('')}</ol>
      <p class="trk-foot">${end ? `Total: <b>${secs(end.at - t.t0)}</b> ${waiting ? 'até parar pra aprovação' : 'do pedido à resposta'}` : 'Em trânsito…'}</p>`;
    el.querySelector('.trk-x').addEventListener('click', closeTrack);
  }

  // ───────────────────────── pergunte ao escritório (roteador simulado, sem IA)
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function route(text) {
    const q = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const scores = D.AGENTS.map(a => {
      const words = (D.ROUTER[a.slug] || []).filter(w => q.includes(' ' + norm(w) + ' ') || (w.length > 4 && q.includes(' ' + norm(w))));
      return { a, words, score: words.length };
    }).sort((x, y) => y.score - x.score);
    return scores;
  }
  function ask(text) {
    const res = route(text);
    const top = res[0].score ? res[0] : { a: D.AGENTS.find(a => a.slug === 'assistente-codex'), words: [], score: 0, fallback: true };
    const orch = 'whatsapp-orchestrator', target = top.a.slug, tName = top.a.shortName;
    const short = text.length > 60 ? text.slice(0, 58) + '…' : text;
    const why = top.fallback ? 'nenhuma palavra conhecida: fica com o Codex, que coordena o que não tem dono' : `palavras: ${top.words.join(', ')}`;
    $('askResult').innerHTML = `<p>Vai para <b>${esc(tName)}</b>${top.words.length ? ` <span>· ${esc(top.words.join(', '))}</span>` : ' <span>· ninguém específico, fica com o Codex</span>'}</p>`;
    traceEv('fila', `Orchestrator classificou sua pergunta → ${tName}`, `roteador simulado no navegador · ${why} · sem IA`, 'local', 'envio');
    const def = target === orch ? {
      key: 'pergunta', title: 'Sua pergunta', route: 'Recepção', steps: [
        { caption: `Chega: “${short}”`, beats: [{ st: { [orch]: 'ready' } }, { say: orch, text: 'Isso eu mesmo resolvo.' }] },
        { caption: 'O Orchestrator responde direto.', beats: [{ st: { [orch]: 'working' } }, { wait: 1400 }, { say: orch, text: 'Respondido no WhatsApp.' }, { st: { [orch]: 'ready' } }] }
      ]
    } : {
      key: 'pergunta', title: 'Sua pergunta', route: `Recepção → ${top.a.room}`, steps: [
        { caption: `Chega: “${short}”`, beats: [{ st: { [orch]: 'working', [target]: 'ready' } }, { say: orch, text: `Isso é com ${tName}.` }] },
        { caption: `O Orchestrator leva o pedido até ${tName}.`, beats: [{ walk: orch, to: target, carry: true }, { st: { [target]: 'queued' } }, { say: orch, text: 'Pedido de um visitante.' }, { home: orch, parallel: true }] },
        { caption: `${tName} trabalha e responde.`, beats: [{ st: { [target]: 'working', [orch]: 'ready' } }, { wait: 1200 }, { say: target, text: 'Anotado. Na versão real, a resposta sairia daqui.' }, { st: { [target]: 'ready' } }] }
      ]
    };
    startScene(def);
  }

  // ───────────────────────── clima e hora reais de São Paulo
  const WX_LABEL = { clear: 'céu limpo', cloud: 'nublado', rain: 'chuva', storm: 'temporal' };
  let wx = null, skyForced = null;
  function skyPhase() {
    if (skyForced && skyForced.phase) return skyForced.phase;
    const p = Object.fromEntries(clockFmt.formatToParts(new Date()).map(x => [x.type, x.value]));
    const h = +p.hour + +p.minute / 60;
    return h < 5.5 || h >= 19.2 ? 'night' : h < 7 ? 'dawn' : h < 17.6 ? 'day' : 'dusk';
  }
  const SKY_WIN = { night: ['#070d2a', '#152a62', '#2a4a92'], dawn: ['#3a3f8f', '#a597ff', '#ffb38a'], day: ['#3563d9', '#79bcff', '#cfe4ff'], dusk: ['#1b2a6b', '#7465d6', '#f08f6f'] };
  function applySky() {
    const phase = skyPhase();
    const kind = (skyForced && skyForced.wx) || (wx && wx.kind) || 'clear';
    document.body.dataset.sky = phase;
    document.body.dataset.wx = kind;
    const stops = svg.querySelectorAll('#gWinSky stop');
    SKY_WIN[phase].forEach((c, i) => stops[i] && stops[i].setAttribute('stop-color', c));
    const el = $('wx');
    if (el) el.textContent = wx ? ` · ${Math.round(wx.temp)}° ${WX_LABEL[kind] || ''}` : '';
    if (moon.pupil !== undefined) renderMoon();
  }
  async function pullWeather() {
    if (!/^https?:$/.test(location.protocol)) { applySky(); return; }
    const t0 = performance.now();
    try {
      const r = await fetch('/api/public/weather', { headers: { Accept: 'application/json' }, credentials: 'omit' });
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (!j || !WX_LABEL[j.kind] || typeof j.temp !== 'number') throw new Error('shape');
      wx = { kind: j.kind, temp: j.temp };
      traceEv('rede', `Clima em São Paulo: ${Math.round(j.temp)}°, ${WX_LABEL[j.kind]}`, `GET /api/public/weather → 200 · ${ms} ms · open-meteo, guardado 10 min no servidor`, 'live', 'rede');
    } catch (e) {
      wx = null;
    }
    applySky();
  }
  window.AO_sky = (phase, wxKind) => { skyForced = phase || wxKind ? { phase, wx: wxKind } : null; applySky(); };

  // ───────────────────────── tour de 1 minuto (pronto pra gravar)
  let tour = null;
  function roomByKey(k) { return D.ROOMS.find(r => r.key === k); }
  function startTour() {
    if (tour) return endTour();
    stopScene(); resetWorld(false); closeTrack();
    if (selected) closeDrawer();
    tour = { i: -1, t: 0, prevRoomOnly: document.body.classList.contains('room-only') };
    document.body.classList.add('touring');
    setRoomOnly(true);
    $('tourCap').hidden = false;
    traceEv('local', 'Tour de 1 minuto começou', 'roteiro em data.js (TOUR) · câmera, cenas e rastreio automáticos', 'sim', 'planta');
    nextTourStep();
  }
  function nextTourStep() {
    tour.i++; tour.t = 0;
    const st = D.TOUR[tour.i];
    if (!st) return endTour();
    $('tourText').textContent = st.text;
    if (st.room) isolateRoom(roomByKey(st.room)); else if (isolated) isolateRoom(null); else setCam(homeCam(), 600);
    if (st.scene) startScene(st.scene);
    if (st.panels) { openHood(true); setTab('hood'); tour.openedHood = true; }
  }
  function tickTour(dt) {
    if (!tour) return;
    tour.t += dt;
    const total = D.TOUR.reduce((a, s) => a + s.dur, 0), done = D.TOUR.slice(0, tour.i).reduce((a, s) => a + s.dur, 0) + tour.t;
    $('tourBar').style.width = Math.min(100, done / total * 100) + '%';
    if (tour.t >= D.TOUR[tour.i].dur) nextTourStep();
  }
  function endTour() {
    if (!tour) return;
    const prev = tour.prevRoomOnly; tour = null;
    document.body.classList.remove('touring');
    $('tourCap').hidden = true;
    if (isolated) isolateRoom(null);
    setRoomOnly(prev);
  }

  // ───────────────────────── segredos: "viu" = festa · ↑↑↓↓←→←→BA = bastidores
  let keyBuf = [];
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  function secretKey(e) {
    if (e.target.matches && e.target.matches('textarea, input')) return;
    keyBuf.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    keyBuf = keyBuf.slice(-10);
    if (keyBuf.slice(-3).join('') === 'viu') { keyBuf = []; party(); }
    if (KONAMI.every((k, i) => keyBuf[i] === k)) { keyBuf = []; toggleDebug(); }
  }
  function party() {
    actors.forEach(a => { a.danceT = 6.5; });
    document.body.classList.add('disco');
    setTimeout(() => document.body.classList.remove('disco'), 6500);
    moonWink(); moonSay('Festa! E tem mais: ↑↑↓↓←→←→BA', 4200);
    const viu = actors.get('viu-mercado-adocao'); if (viu) say(viu, 'Viu? Agora todo mundo dança.');
    traceEv('local', 'Segredo: festa da lua', 'teclas digitadas "v-i-u" · 6,5 s de dança, nada muda nos dados', 'local', 'planta');
  }
  let debugOn = false, fps = 60, fpsAcc = 0, fpsN = 0;
  function toggleDebug() {
    debugOn = !debugOn;
    document.body.classList.toggle('debug-view', debugOn);
    $('dbgHud').hidden = !debugOn;
    const old = $('lDebug'); if (old) old.remove();
    if (debugOn) {
      const g = document.createElementNS(NS, 'g'); g.id = 'lDebug';
      let s = '';
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const pts = P(iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1));
        s += `<polygon points="${pts}" class="${walkable(x, y) ? 'dbg-tile' : 'dbg-block'}"/>`;
      }
      D.PARTITIONS.forEach(p => { for (let i = p.from; i < p.to; i++) {
        const a = p.axis === 'x' ? iso(p.at, i) : iso(i, p.at), b = p.axis === 'x' ? iso(p.at, i + 1) : iso(i + 1, p.at);
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${p.doors.includes(i) ? 'dbg-door' : 'dbg-wall'}"/>`;
      } });
      D.AGENTS.forEach(a => {
        const c = iso(a.seat[0] + 0.5, a.seat[1] + 0.5), v = iso(a.visit[0] + 0.5, a.visit[1] + 0.5);
        s += `<circle cx="${c[0]}" cy="${c[1]}" r="4" class="dbg-seat"/><circle cx="${v[0]}" cy="${v[1]}" r="5" class="dbg-visit"/><line x1="${c[0]}" y1="${c[1]}" x2="${v[0]}" y2="${v[1]}" class="dbg-link"/>`;
      });
      g.innerHTML = s;
      $('lPath').after(g);
      actors.forEach(a => { a.dbgRoute = true; });
    }
    actors.forEach(a => { a.dbgRoute = debugOn; });
    traceEv('local', debugOn ? 'Segredo: bastidores do código ligados' : 'Bastidores desligados', `grade ${W}×${H} · ${blocked.size} tiles bloqueados · caminho por Dijkstra em 8 direções`, 'local', 'planta');
  }
  function tickDebug(dt) {
    if (!debugOn) return;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
      const walking = [...actors.values()].filter(a => a.path.length).length;
      $('dbgHud').innerHTML = `<b>bastidores</b><span>${fps} fps</span><span>${actors.size} agentes · ${walking} andando</span><span>${furniture.length} objetos ordenados por profundidade (x+y)</span><span>grade ${W}×${H} · ${blocked.size} bloqueados</span><span>câmera ${cam.s.toFixed(2)}×</span><span class="dbg-k">↑↑↓↓←→←→BA desliga</span>`;
    }
  }

  // ───────────────────────── guia da primeira visita (4 passos, aparece uma vez)
  const GUIDE_KEY = 'agent-office.guide.v1';
  const GUIDE = [
    { text: 'Cada bonequinho é um agente de IA. Clique em um pra ver o que ele faz e quais regras segue.', target: () => { const a = actors.get('whatsapp-orchestrator'); return a && a.node; }, actor: 'whatsapp-orchestrator' },
    { text: 'Cada sala é uma área de trabalho. Clique no chão de uma pra ver só ela, com um resumo.', target: () => { const t = roomTags.find(x => x.key === 'infra'); return t && t.el; } },
    { text: 'Sem tempo? Assista um pedido andando de sala em sala, explicado em 1 minuto.', target: () => !document.body.classList.contains('room-only') && window.innerWidth > 900 ? $('tourBtn') : null },
    { text: 'Aqui fica o resumo do escritório. Toque no “?” pra ver o que cada cor significa.', target: () => $('island') }
  ];
  let guideStep = -1;
  function startGuide() { guideStep = -1; nextGuide(); }
  function endGuide() {
    guideStep = -1; $('coach').hidden = true;
    actors.forEach(a => a.node.classList.remove('coach-target'));
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* sem armazenamento */ }
  }
  function nextGuide() {
    actors.forEach(a => a.node.classList.remove('coach-target'));
    guideStep++;
    while (guideStep < GUIDE.length && !GUIDE[guideStep].target()) guideStep++;
    if (guideStep >= GUIDE.length) return endGuide();
    const g = GUIDE[guideStep], el = $('coach'), t = g.target();
    if (g.actor) actors.get(g.actor).node.classList.add('coach-target');
    $('coachText').textContent = g.text;
    $('coachStep').textContent = `${guideStep + 1} de ${GUIDE.length}`;
    $('coachNext').textContent = guideStep === GUIDE.length - 1 ? 'Entendi' : 'Próximo';
    el.hidden = false;
    const r = t.getBoundingClientRect(), box = el.getBoundingClientRect();
    const below = r.top - box.height - 18 < 64 && r.bottom + box.height + 18 < window.innerHeight;
    const x = clamp(r.left + r.width / 2 - box.width / 2, 12, window.innerWidth - box.width - 12);
    const y = below ? r.bottom + 12 : r.top - box.height - 12;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.dataset.side = below ? 'below' : 'above';
    el.style.setProperty('--ax', clamp(r.left + r.width / 2 - x, 20, box.width - 20) + 'px');
  }

  // ───────────────────────── boot
  {
    const n = D.AGENTS.length;
    const words = ['Zero', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze', 'Doze', 'Treze', 'Catorze', 'Quinze', 'Dezesseis', 'Dezessete', 'Dezoito', 'Dezenove', 'Vinte'];
    $('agentWord').textContent = words[n] || String(n);
    document.title = 'Agent Office';
  }
  applyLive(firstLive);
  buildScene();
  {
    const auto = D.ROOMS.filter(r => r.auto).length, fixed = D.ROOMS.filter(r => !r.auto && r.key !== 'hall').length;
    traceEv('planta', auto ? `Planta montada: ${auto} sala${auto > 1 ? 's' : ''} criada${auto > 1 ? 's' : ''} sozinha${auto > 1 ? 's' : ''} para grupos novos` : 'Planta montada a partir da lista de agentes',
      `layout.js · ${fixed} salas fixas + ${auto} automáticas · ${D.AGENTS.length} mesas · ${W}×${H} tiles`, 'local');
    traceFetch(firstLive);
  }
  buildRoomTags();
  loadLooks();
  bind();
  setMode('visitor');
  renderScenes();
  renderLog();
  tickClock(); setInterval(tickClock, 1000);
  pullWeather(); setInterval(pullWeather, 10 * 60 * 1000); setInterval(applySky, 60 * 1000);
  setCam(homeCam());
  setInterval(renderIsland, 600);
  setInterval(pullLive, 60000);
  try { if (!localStorage.getItem(GUIDE_KEY)) setTimeout(() => { if (!tour && !selected) startGuide(); }, 1400); } catch (e) { /* sem armazenamento: sem guia */ }
  requestAnimationFrame(t => { last = t; frame(t); });
})();
