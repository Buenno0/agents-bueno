/* Agent Office — planta automática.
 * As 4 salas originais continuam desenhadas à mão. Todo agente sem mesa (grupo novo,
 * ou sala original já cheia) ganha uma sala numa ala nova, à direita do andar.
 * Cada ala tem duas salas (uma de cada lado do corredor), mesas, muretas e porta.
 * Sem DOM: roda no navegador (window.AO_LAYOUT) e no Node (testes e exportador).
 */
(function (root) {
  'use strict';

  // nomes que o servidor usa para as salas originais
  const ROOM_ALIASES = {
    'hub central': 'hub', 'recepção': 'hub', 'recepcao': 'hub',
    'war room infra': 'infra', 'sala técnica': 'infra', 'sala tecnica': 'infra',
    'product lab': 'lab', 'estúdio': 'lab', 'estudio': 'lab',
    'personal ops': 'ops', 'dia a dia': 'ops'
  };
  // cores para salas novas (piso em dois tons + destaque), na família da LP
  const PALETTE = [
    { floor: ['#2a1f5e', '#2e2366'], accent: '#ff7cb8' },
    { floor: ['#3a2a52', '#402e5a'], accent: '#f08f6f' },
    { floor: ['#1b3a4f', '#1e4157'], accent: '#8cc6ff' },
    { floor: ['#2f3a1f', '#354125'], accent: '#c3e88d' },
    { floor: ['#3b2f17', '#42351b'], accent: '#ffc35c' },
    { floor: ['#1f2a5e', '#233066'], accent: '#a597ff' }
  ];
  const LOOKS = [
    ['#ff7cb8', 'beret', '#0a1230'], ['#79bcff', 'cloud', '#f3f5ff'], ['#c3e88d', 'bulb', '#fff3c9'],
    ['#ffc35c', 'hardhat', '#ffd27a'], ['#b7abff', 'atom', '#ffd27a'], ['#f08f6f', 'books', '#5674c8'],
    ['#8fe3cf', 'bubble', '#f3f5ff'], ['#e8a0ff', 'crown', '#ffd27a']
  ];
  const EMPTY = { floor: ['#121d4d', '#142052'], accent: null };

  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'grupo';
  const clone = o => JSON.parse(JSON.stringify(o));

  // quantas colunas de mesas cabem n agentes (2 mesas por coluna) e a largura da sala
  const colsFor = n => Math.max(1, Math.ceil(n / 2));
  const widthFor = n => Math.max(7, 3 * colsFor(n) + 2);

  function build(base, extraAgents) {
    const D = clone(base);
    const known = new Map(D.ROOMS.map(r => [r.key, r]));
    const named = new Map((D.GROUPS || []).map(g => [g.key, g]));
    const all = D.AGENTS.concat((extraAgents || []).map(a => ({ ...clone(a), auto: true })));

    // 1) quem precisa de mesa, agrupado por sala
    const groups = new Map();
    all.forEach(a => {
      if (a.seat) return;
      let key = a.roomKey || ROOM_ALIASES[String(a.room || '').trim().toLowerCase()] || slugify(a.room);
      let name = (named.get(key) && named.get(key).name) || a.room || 'Sala nova';
      if (known.has(key)) { name = known.get(key).name + ' · anexo'; key = key + '-anexo'; }
      if (!groups.has(key)) groups.set(key, { key, name, agents: [], style: named.get(key) || null });
      groups.get(key).agents.push(a);
    });
    if (!groups.size) return D;

    // 2) alas: cada uma com sala de cima (y 0–5) e de baixo (y 8–14)
    const list = [...groups.values()];
    let cursor = D.FLOOR.w;
    for (let w = 0; w * 2 < list.length; w++) {
      const top = list[w * 2], bottom = list[w * 2 + 1] || null;
      const width = Math.max(widthFor(top.agents.length), bottom ? widthFor(bottom.agents.length) : 7);
      const x0 = cursor, x1 = cursor + width - 1;
      [[top, 0, 5, 1], [bottom, 8, 14, -1]].forEach(([g, y0, y1, facing], half) => {
        const idx = w * 2 + half;
        const pal = g ? (g.style && g.style.accent ? { floor: g.style.floor || PALETTE[idx % PALETTE.length].floor, accent: g.style.accent } : PALETTE[idx % PALETTE.length]) : EMPTY;
        const room = {
          key: g ? g.key : `livre-${w}`, name: g ? g.name : 'Espaço livre',
          x0, y0, x1, y1, floor: pal.floor, accent: pal.accent,
          proof: g ? ((g.style && g.style.proof) || 'Sala criada sozinha quando o grupo apareceu') : '', auto: true, empty: !g,
          summary: g ? ((g.style && g.style.summary) || `Sala criada sozinha quando o grupo “${g.name}” apareceu no sistema. Tem ${g.agents.length} ${g.agents.length === 1 ? 'agente' : 'agentes'}.`) : 'Espaço reservado pro próximo grupo que aparecer.'
        };
        D.ROOMS.push(room);
        // muretas: lado esquerdo inteiro, porta para o corredor
        D.PARTITIONS.push({ axis: 'x', at: x0, from: y0, to: y1 + 1, doors: [] });
        // porta no meio, em colunas que nunca têm mesa (x0+3m e x0+3m+1)
        const door = x0 + 3 * Math.floor((width - 1) / 6);
        D.PARTITIONS.push({ axis: 'y', at: half ? 8 : 6, from: x0, to: x1 + 1, doors: [door, door + 1] });
        if (!g) return;
        g.agents.forEach((a, i) => {
          const c = Math.floor(i / 2), r = i % 2;
          const sx = x0 + 1 + 3 * c;
          const sy = half ? (r ? 12 : 9) : (r ? 4 : 1);
          a.seat = [sx, sy]; a.visit = [sx - 1, sy]; a.facing = facing;
          a.roomKey = room.key; a.room = room.name;
        });
      });
      cursor = x1 + 1;
    }
    D.FLOOR.w = cursor;
    const hall = D.ROOMS.find(r => r.key === 'hall');
    if (hall) hall.x1 = cursor - 1;

    // 3) completa o que faltar em cada agente novo
    let li = 0;
    all.forEach(a => {
      if (!a.look) { const [body, hat, hatColor] = LOOKS[li++ % LOOKS.length]; a.look = { body, hat, hatColor, outfit: 'none', outfitColor: '#0a1230' }; }
      a.shortName = a.shortName || String(a.displayName || a.slug).split(' — ')[0].slice(0, 18);
      a.displayName = a.displayName || a.shortName;
      a.roleTitle = a.roleTitle || 'Agente';
      a.publicSummary = a.publicSummary || a.roleTitle + '.';
      a.workingLabel = a.workingLabel || 'Trabalhando';
      a.guardrailBadge = a.guardrailBadge || '—';
      a.lastActiveRelative = a.lastActiveRelative || 'há mais tempo';
      a.status = a.status || 'ready';
      a.quickPrompts = a.quickPrompts || ['O que você está fazendo?', 'Me mande um resumo'];
      if (a.primaryModelFamily === undefined) a.primaryModelFamily = null;
      if (a.backupPoolsCount === undefined) a.backupPoolsCount = null;
    });
    D.AGENTS = all;
    return D;
  }

  // ───────── navegação (paredes + móveis), usada pelo app e pelos testes
  function createNav(D, blocked) {
    const W = D.FLOOR.w, H = D.FLOOR.h;
    const key = (x, y) => x + ',' + y;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const walkable = (x, y) => inside(x, y) && !blocked.has(key(x, y));
    function edgeOpen(ax, ay, bx, by) {
      for (const p of D.PARTITIONS) {
        if (p.axis === 'x' && ax !== bx && ay === by && Math.max(ax, bx) === p.at && ay >= p.from && ay < p.to && !p.doors.includes(ay)) return false;
        if (p.axis === 'y' && ay !== by && ax === bx && Math.max(ay, by) === p.at && ax >= p.from && ax < p.to && !p.doors.includes(ax)) return false;
      }
      return true;
    }
    function neighbors(x, y) {
      const out = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!walkable(nx, ny)) continue;
        if (dx && dy) {
          if (!walkable(x + dx, y) || !walkable(x, y + dy)) continue;
          if (!edgeOpen(x, y, x + dx, y) || !edgeOpen(x + dx, y, nx, ny) || !edgeOpen(x, y, x, y + dy) || !edgeOpen(x, y + dy, nx, ny)) continue;
        } else if (!edgeOpen(x, y, nx, ny)) continue;
        out.push([nx, ny, dx && dy ? 1.414 : 1]);
      }
      return out;
    }
    function findPath(sx, sy, tx, ty) {
      if (sx === tx && sy === ty) return [];
      const dist = new Map(), prev = new Map(), open = [[0, sx, sy]];
      dist.set(key(sx, sy), 0);
      while (open.length) {
        open.sort((a, b) => a[0] - b[0]);
        const [d, x, y] = open.shift();
        if (x === tx && y === ty) break;
        if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
        for (const [nx, ny, c] of neighbors(x, y)) {
          const nd = d + c, k = key(nx, ny);
          if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); prev.set(k, [x, y]); open.push([nd, nx, ny]); }
        }
      }
      if (!prev.has(key(tx, ty))) return null;
      const path = []; let cur = [tx, ty];
      while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
      return path;
    }
    return { inside, walkable, edgeOpen, neighbors, findPath };
  }

  root.AO_LAYOUT = { build, createNav, slugify, ROOM_ALIASES };
})(typeof window !== 'undefined' ? window : globalThis);
