/* Agent Office — sprites e cenário (sem DOM).
 * Tudo que é desenho mora aqui: caixa isométrica, paredes, móveis, Olheiros e chapéus.
 * Usado pelo app (window.AO_SPRITES) e pelo exportador de assets (node, via vm).
 */
(function (root) {
  'use strict';
  const TW = 64, TH = 32;               // tile 2:1
  const WALL_H = 118, PART_H = 24, SLAB = 16;

  function createScene(D) {
    const iso = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z];
    const P = (...pts) => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      const f = amt < 0 ? 0 : 255, t = Math.abs(amt);
      r = Math.round((f - r) * t + r); g = Math.round((f - g) * t + g); b = Math.round((f - b) * t + b);
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // Caixa isométrica (x,y em tiles; z,h em px). Faces: topo, esquerda (+y, clara), direita (+x, escura).
    function box(x, y, z, w, d, h, c, extra = '') {
      const t = z + h;
      const top = P(iso(x, y, t), iso(x + w, y, t), iso(x + w, y + d, t), iso(x, y + d, t));
      const left = P(iso(x, y + d, t), iso(x + w, y + d, t), iso(x + w, y + d, z), iso(x, y + d, z));
      const right = P(iso(x + w, y, t), iso(x + w, y + d, t), iso(x + w, y + d, z), iso(x + w, y, z));
      return `<polygon points="${left}" fill="${c.l}"${extra}/><polygon points="${right}" fill="${c.r}"${extra}/><polygon points="${top}" fill="${c.t}"${extra}/>`;
    }
    const tone = (base) => ({ t: shade(base, 0.12), l: base, r: shade(base, -0.22) });

    // Matriz para desenhar no plano de uma parede. 'y0' = parede do fundo-direita, 'x0' = fundo-esquerda.
    function wallM(wall, u, v) {
      if (wall === 'y0') { const o = iso(u, 0, v); return `matrix(1 0.5 0 1 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`; }
      const o = iso(0, u, v); return `matrix(1 -0.5 0 1 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;
    }
    // Matriz para pintar no chão (texto deitado ao longo de x).
    function floorM(x, y) { const o = iso(x, y); return `matrix(1 0.5 -1 0.5 ${o[0].toFixed(1)} ${o[1].toFixed(1)})`; }

    const W = D.FLOOR.w, H = D.FLOOR.h;
    const blocked = new Set();
    const key = (x, y) => x + ',' + y;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

    function roomAt(x, y) { return D.ROOMS.find(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1); }

    // ───────────────────────── cena estática
    const furniture = [];   // { key: depth, svg, id }
    // cada peça lembra em que sala(s) está, pra dar pra isolar uma sala depois
    let anchor = null;
    const at = (...tiles) => { anchor = tiles; };
    function addFurni(depth, svg, cls = '') {
      const rooms = anchor ? [...new Set(anchor.filter(([x, y]) => inside(x, y)).map(([x, y]) => (roomAt(x, y) || {}).key))] : [];
      furniture.push({ depth, svg, cls, rooms });
    }
    function block(...tiles) { tiles.forEach(t => blocked.add(key(t[0], t[1]))); }

    function buildDefs() {
      return `
      <defs>
        <linearGradient id="gWinSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#070d2a"/><stop offset=".6" stop-color="#152a62"/><stop offset="1" stop-color="#2a4a92"/>
        </linearGradient>
        <radialGradient id="gLamp"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset=".55" stop-color="#ffd27a" stop-opacity=".14"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
        <radialGradient id="gScreen"><stop offset="0" stop-color="#ffe3a6" stop-opacity=".75"/><stop offset=".5" stop-color="#ffd27a" stop-opacity=".22"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
        <radialGradient id="gMint"><stop offset="0" stop-color="#5bd1b5" stop-opacity=".35"/><stop offset="1" stop-color="#5bd1b5" stop-opacity="0"/></radialGradient>
        <radialGradient id="gUnder" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3563d9" stop-opacity=".35"/><stop offset="1" stop-color="#3563d9" stop-opacity="0"/></radialGradient>
        <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>`;
    }

    function buildBase() {
      let s = '';
      // halo sob o prédio
      const c = iso(W / 2, H / 2);
      s += `<ellipse cx="${c[0]}" cy="${c[1] + 60}" rx="${(W + H) * 22}" ry="${(W + H) * 9}" fill="url(#gUnder)"/>`;
      // laje: faces frontais
      s += `<polygon points="${P(iso(0, H), iso(W, H), iso(W, H, -SLAB), iso(0, H, -SLAB))}" fill="#0e1a48"/>`;
      s += `<polygon points="${P(iso(W, 0), iso(W, H), iso(W, H, -SLAB), iso(W, 0, -SLAB))}" fill="#0a1438"/>`;
      s += `<polyline points="${P(iso(0, H), iso(W, H), iso(W, 0))}" fill="none" stroke="#2f4a9a" stroke-width="1.4" stroke-linejoin="round"/>`;
      // piso por tile
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const r = roomAt(x, y);
        const f = r.floor[(x + y) % 2];
        s += `<polygon points="${P(iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1))}" fill="${f}" stroke="#ffffff" stroke-opacity=".035" stroke-width="1"/>`;
      }
      // contorno de cada sala na cor dela: separa sem precisar de parede alta
      D.ROOMS.filter(r => r.accent).forEach(r => {
        const i = 0.1, x0 = r.x0 + i, y0 = r.y0 + i, x1 = r.x1 + 1 - i, y1 = r.y1 + 1 - i;
        s += `<polygon points="${P(iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1))}" fill="${r.accent}" fill-opacity=".035" stroke="${r.accent}" stroke-opacity=".38" stroke-width="1.6" stroke-linejoin="round"/>`;
      });
      // tapetinho em cada porta
      D.PARTITIONS.forEach(p => {
        const runs = [];
        p.doors.slice().sort((a, b) => a - b).forEach(d => { const last = runs[runs.length - 1]; if (last && d === last[1] + 1) last[1] = d; else runs.push([d, d]); });
        runs.forEach(([a, b]) => {
          const [x0, y0, x1, y1] = p.axis === 'y' ? [a + 0.12, p.at - 0.28, b + 0.88, p.at + 0.28] : [p.at - 0.28, a + 0.12, p.at + 0.28, b + 0.88];
          s += `<polygon points="${P(iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1))}" fill="#ffd27a" fill-opacity=".16" stroke="#ffd27a" stroke-opacity=".35" stroke-width="1"/>`;
        });
      });
      // linha âmbar do corredor (assinatura da LP), discreta
      s += `<line x1="${iso(1.4, 7)[0]}" y1="${iso(1.4, 7)[1]}" x2="${iso(W - 0.4, 7)[0]}" y2="${iso(W - 0.4, 7)[1]}" stroke="#ffd27a" stroke-width="1.2" stroke-dasharray="6 8" opacity=".3"/>`;
      return s;
    }

    // janela com céu, prédios e luzes acesas
    function windowSvg(wall, u0, u1, v0, v1, seed, moon = false) {
      const w = (u1 - u0) * 32, h = v1 - v0;
      let s = `<g transform="${wallM(wall, wall === 'y0' ? u0 : u1, v1)}">`;
      s += `<rect width="${w}" height="${h}" fill="url(#gWinSky)"/>`;
      // estrelas
      let r = seed;
      const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 7; i++) s += `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h * 0.45).toFixed(1)}" r=".8" fill="#f3f5ff" class="tw" style="animation-delay:${(rnd() * 3).toFixed(2)}s"/>`;
      if (moon) s += `<circle cx="${w * 0.72}" cy="${h * 0.24}" r="6" fill="#fff3c9"/><circle cx="${w * 0.72}" cy="${h * 0.24}" r="11" fill="#fff3c9" opacity=".12"/>`;
      // skyline
      let x = -2;
      while (x < w) {
        const bw = 8 + rnd() * 14, bh = h * (0.22 + rnd() * 0.42);
        s += `<rect x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${rnd() > .5 ? '#0a1438' : '#0e1a48'}"/>`;
        for (let wy = h - bh + 4; wy < h - 3; wy += 6) for (let wx = x + 2; wx < x + bw - 2; wx += 4) {
          if (rnd() > 0.72) s += `<rect class="win-lit" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="1.6" height="2.2" fill="#ffd27a" opacity="${(0.55 + rnd() * 0.45).toFixed(2)}"/>`;
        }
        x += bw + 1;
      }
      // chuva (só aparece quando chove em São Paulo)
      s += `<g class="win-rain">${Array.from({ length: Math.round(w / 6) }, (_, i) => `<line x1="${(i * 6 + rnd() * 4).toFixed(1)}" y1="${(rnd() * h).toFixed(1)}" x2="${(i * 6 + rnd() * 4 - 2).toFixed(1)}" y2="${(rnd() * h + 7).toFixed(1)}" style="animation-delay:${(rnd()).toFixed(2)}s"/>`).join('')}</g>`;
      // caixilho
      s += `<rect width="${w}" height="${h}" fill="none" stroke="#3a56a8" stroke-width="3"/>`;
      for (let m = 32; m < w - 4; m += 32) s += `<line x1="${m}" y1="0" x2="${m}" y2="${h}" stroke="#3a56a8" stroke-width="2"/>`;
      s += `<line x1="0" y1="${h * 0.38}" x2="${w}" y2="${h * 0.38}" stroke="#3a56a8" stroke-width="1.5"/>`;
      s += `<rect y="${h}" width="${w}" height="3" fill="#4a68c4"/>`;
      s += '</g>';
      return s;
    }

    function buildWalls() {
      let s = '';
      // parede y=0 (fundo direita) — face clara
      s += `<polygon points="${P(iso(0, 0), iso(W, 0), iso(W, 0, WALL_H), iso(0, 0, WALL_H))}" fill="#1d306c"/>`;
      // parede x=0 (fundo esquerda) — face escura
      s += `<polygon points="${P(iso(0, 0), iso(0, H), iso(0, H, WALL_H), iso(0, 0, WALL_H))}" fill="#16275e"/>`;
      // rodapé
      s += `<polygon points="${P(iso(0, 0), iso(W, 0), iso(W, 0, 5), iso(0, 0, 5))}" fill="#14245a"/>`;
      s += `<polygon points="${P(iso(0, 0), iso(0, H), iso(0, H, 5), iso(0, 0, 5))}" fill="#0f1d4e"/>`;
      // tampo (espessura)
      const T = 0.16;
      s += `<polygon points="${P(iso(-T, -T, WALL_H), iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(0, 0, WALL_H))}" fill="#4a68c4"/>`;
      s += `<polygon points="${P(iso(-T, -T, WALL_H), iso(-T, H, WALL_H), iso(0, H, WALL_H), iso(0, 0, WALL_H))}" fill="#3f5cb6"/>`;
      // bordas das pontas
      s += `<polygon points="${P(iso(W, -T, WALL_H), iso(W, 0, WALL_H), iso(W, 0, 0), iso(W, -T, 0))}" fill="#22397f"/>`;
      s += `<polygon points="${P(iso(-T, H, WALL_H), iso(0, H, WALL_H), iso(0, H, 0), iso(-T, H, 0))}" fill="#2f4a9e"/>`;
      // divisa visual dos cômodos na parede (pilares)
      [7, ...D.ROOMS.filter(r => r.auto && r.y0 === 0).map(r => r.x0)].forEach(u => { s += `<polygon points="${P(iso(u - .08, 0, 0), iso(u + .08, 0, 0), iso(u + .08, 0, WALL_H), iso(u - .08, 0, WALL_H))}" fill="#24397a"/>`; });
      [6, 8].forEach(u => { s += `<polygon points="${P(iso(0, u - .08, 0), iso(0, u + .08, 0), iso(0, u + .08, WALL_H), iso(0, u - .08, WALL_H))}" fill="#1c2f6a"/>`; });

      // janelas
      s += windowSvg('y0', 7.5, 10.6, 30, 98, 11, true);
      s += windowSvg('y0', 15.4, 18.6, 30, 98, 23);
      s += windowSvg('x0', 4.1, 5.9, 34, 98, 37);
      s += windowSvg('x0', 8.3, 9.8, 30, 98, 41);
      s += windowSvg('x0', 13.1, 14.8, 30, 98, 53);
      // salas criadas sozinhas ganham janela na parede do fundo
      D.ROOMS.filter(r => r.auto && r.y0 === 0).forEach((r, i) => { s += windowSvg('y0', r.x0 + 0.7, r.x1 + 0.3, 30, 98, 61 + i * 7, i % 3 === 1); });

      s += wallSign() + wallClock() + elevator() + warPanel() + whiteboard() + cafeBoard();
      return s;
    }

    // letreiro da recepção (parede y0, hub)
    function wallSign() {
      // largura fixa do texto (textLength): nunca vaza da placa, mesmo com fonte reserva
      const w = 4.3 * 32;
      return `<g transform="${wallM('y0', 1.95, 92)}">
        <rect width="${w}" height="40" rx="4" fill="#0c1945" stroke="#2f4a9a" stroke-width="1.5"/>
        <g transform="translate(12 9)">${logoMark(22)}</g>
        <text x="44" y="26" class="wall-brand" textLength="${w - 58}" lengthAdjust="spacingAndGlyphs">agent office</text>
        <rect x="6" y="44" width="${w - 12}" height="2" fill="#ffd27a" opacity=".55"/>
      </g>`;
    }
    // relógio de parede (hora real de São Paulo)
    function wallClock() {
      return `<g transform="${wallM('y0', 0.55, 86)}">
        <circle cx="16" cy="16" r="14" fill="#f3f5ff"/><circle cx="16" cy="16" r="14" fill="none" stroke="#0a1230" stroke-width="2.5"/>
        ${[0, 1, 2, 3].map(i => `<rect x="15.2" y="4" width="1.6" height="3.2" fill="#0a1230" transform="rotate(${i * 90} 16 16)"/>`).join('')}
        <line id="clkH" x1="16" y1="16" x2="16" y2="8.5" stroke="#0a1230" stroke-width="2.4" stroke-linecap="round"/>
        <line id="clkM" x1="16" y1="16" x2="16" y2="5.5" stroke="#0a1230" stroke-width="1.6" stroke-linecap="round"/>
        <line id="clkS" x1="16" y1="19" x2="16" y2="4" stroke="#ff6b6b" stroke-width="0.9" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="1.8" fill="#ff6b6b"/>
      </g>`;
    }
    // elevador (parede x0, hub) — andar 13
    function elevator() {
      return `<g transform="${wallM('x0', 3.85, 74)}">
        <rect x="-4" y="-4" width="${1.7 * 32 + 8}" height="78" fill="#2a4290"/>
        <rect width="${1.7 * 32}" height="74" fill="#1a2a66"/>
        <rect x="2" y="2" width="${1.7 * 16 - 3}" height="72" fill="#22397f"/>
        <rect x="${1.7 * 16 + 1}" y="2" width="${1.7 * 16 - 3}" height="72" fill="#22397f"/>
        <rect x="${1.7 * 16 - 0.5}" y="2" width="1" height="72" fill="#0a1438"/>
        <rect x="${1.7 * 16 - 12}" y="-20" width="24" height="12" rx="2" fill="#0a1438"/>
        <text x="${1.7 * 16}" y="-11" class="wall-num">13</text>
      </g>`;
    }
    // painel da War Room (parede y0)
    function warPanel() {
      return `<g transform="${wallM('y0', 11.1, 96)}">
        <rect x="-3" y="-3" width="${3.9 * 32 + 6}" height="62" rx="3" fill="#0a1230"/>
        <rect width="${3.9 * 32}" height="56" fill="#0b1640"/>
        <polyline class="spark" points="6,40 18,34 28,37 40,22 52,28 64,18 76,24 88,14 100,20 112,12 120,16" fill="none" stroke="#5bd1b5" stroke-width="1.8" stroke-linejoin="round"/>
        <polyline points="6,48 120,48" stroke="#2f4a9a" stroke-width="1"/>
        ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${8 + i * 5}" y="${6 + (i % 3) * 2}" width="3" height="${10 - (i % 3) * 2}" fill="#ffd27a" opacity=".85"/>`).join('')}
        <circle cx="116" cy="7" r="2.2" fill="#5bd1b5" class="blink"/>
      </g>`;
    }
    // lousa do Product Lab (parede x0)
    function whiteboard() {
      return `<g transform="${wallM('x0', 12.8, 92)}">
        <rect x="-3" y="-3" width="${2.6 * 32 + 6}" height="56" rx="2" fill="#9fadd8"/>
        <rect width="${2.6 * 32}" height="50" fill="#eef2fb"/>
        <rect x="6" y="6" width="14" height="12" fill="#ff7cb8"/><rect x="24" y="6" width="14" height="12" fill="#ffd27a"/><rect x="42" y="6" width="14" height="12" fill="#5fd3b8"/>
        <rect x="6" y="22" width="14" height="12" fill="#ffd27a"/><rect x="24" y="22" width="14" height="12" fill="#a597ff"/>
        <path d="M44 40 C52 24 60 46 68 30 S78 28 80 22" fill="none" stroke="#3563d9" stroke-width="1.6"/>
        <rect x="62" y="44" width="14" height="3" rx="1.5" fill="#0a1230"/>
      </g>`;
    }
    // quadro de café do corredor (parede x0)
    function cafeBoard() {
      return `<g transform="${wallM('x0', 7.75, 84)}">
        <rect width="46" height="26" rx="2" fill="#0a1230" stroke="#2f4a9a"/>
        <text x="23" y="16" class="wall-cafe">café</text>
      </g>`;
    }
    // a lua do céu, com o olho dos Olheiros (easter egg do modo visitante)
    function moonSvg(size = 44, withEye = true, sun = false) {
      const body = sun
        ? `${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="20.5" y="-1" width="3" height="7" rx="1.5" fill="#ffc35c" transform="rotate(${i * 45} 22 22)"/>`).join('')}<circle cx="22" cy="22" r="16" fill="#ffd27a"/>`
        : `<circle cx="22" cy="22" r="20" fill="#fff3c9"/>
        <circle cx="12" cy="14" r="3.2" fill="#f2deaa"/><circle cx="31" cy="32" r="2.4" fill="#f2deaa"/><circle cx="33" cy="12" r="1.8" fill="#f2deaa"/><circle cx="11" cy="30" r="1.5" fill="#f2deaa"/>`;
      return `<svg class="moon-svg" viewBox="0 0 44 44" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible">
        ${body}
        ${withEye ? `<g class="moon-eye">
          <rect class="moon-frame" x="13" y="14" width="18" height="17" rx="6" fill="#ffd27a"/>
          <rect x="16" y="17" width="12" height="11" rx="4" fill="#fffaf0" stroke="#0a1230" stroke-opacity=".3" stroke-width="1.2"/>
          <g class="moon-pupil"><circle cx="22" cy="22.5" r="3.4" fill="#0a1230"/><circle cx="20.8" cy="21.2" r="1.1" fill="#fff"/></g>
          <rect class="moon-lid" x="13" y="14" width="18" height="0" rx="6" fill="#f2deaa"/>
        </g>` : `<path class="moon-sleep" d="M16 23 Q22 27 28 23" stroke="#c9a96a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`}
      </svg>`;
    }

    function logoMark(size) {
      const k = size / 32;
      return `<g transform="scale(${k})">
        <polygon points="16,2 30,10 16,18 2,10" fill="#4a68c4"/>
        <polygon points="2,10 16,18 16,30 2,22" fill="#2f4a9e"/>
        <polygon points="30,10 16,18 16,30 30,22" fill="#22397f"/>
        <polygon points="6,15 11,17.9 11,23 6,20.1" fill="#ffd27a"/>
        <polygon points="21,17.9 26,15 26,20.1 21,23" fill="#ffd27a" opacity=".55"/>
      </g>`;
    }

    function buildPartitions() {
      // cada metro de divisória é um objeto ordenado por profundidade
      D.PARTITIONS.forEach(p => {
        for (let i = p.from; i < p.to; i++) {
          if (p.doors.includes(i)) {
            // batente nas laterais da porta
            const prevDoor = p.doors.includes(i - 1), nextDoor = p.doors.includes(i + 1);
            const side = j => p.axis === 'x' ? [[p.at - 1, j], [p.at, j]] : [[j, p.at - 1], [j, p.at]];
            if (!prevDoor) { at(...side(i), ...side(i - 1)); addFurni(p.axis === 'x' ? p.at + i : i + p.at - 0.02, post(p, i)); }
            if (!nextDoor) { at(...side(i), ...side(i + 1)); addFurni(p.axis === 'x' ? p.at + i + 1 : i + 1 + p.at - 0.02, post(p, i + 1)); }
            continue;
          }
          const T = 0.07;
          const svg = p.axis === 'x'
            ? box(p.at - T, i, 0, 2 * T, 1, PART_H, WALL_C)
            : box(i, p.at - T, 0, 1, 2 * T, PART_H, WALL_C);
          const depth = p.axis === 'x' ? p.at + i + 0.5 - 0.3 : i + 0.5 + p.at - 0.3;
          at(...(p.axis === 'x' ? [[p.at - 1, i], [p.at, i]] : [[i, p.at - 1], [i, p.at]]));
          addFurni(depth, svg);
        }
      });
    }
    const WALL_C = { t: '#6a86d8', l: '#2c4793', r: '#213a7d' };
    function post(p, i) {
      const [x, y] = p.axis === 'x' ? [p.at - 0.06, i - 0.06] : [i - 0.06, p.at - 0.06];
      return box(x, y, 0, 0.14, 0.14, PART_H + 10, { t: '#ffd27a', l: '#3f5cb6', r: '#2f4a9e' });
    }

    // ───────── móveis
    function plant(x, y, tall = false) {
      at([x, y]);
      block([x, y]);
      const cx = x + 0.5, cy = y + 0.5;
      let s = box(cx - 0.22, cy - 0.22, 0, 0.44, 0.44, 14, { t: '#2a1f18', l: '#d8a57a', r: '#b9875f' });
      const top = iso(cx, cy, tall ? 44 : 26);
      const L = [['#23896f', -9, 4, 11], ['#3fa58e', 7, 2, 11], ['#38b896', -2, -6, 12], ['#5fd3b8', 3, -14, 8]];
      if (tall) L.push(['#3fa58e', -6, -20, 9], ['#5fd3b8', 5, -26, 7]);
      s += `<line x1="${iso(cx, cy, 14)[0]}" y1="${iso(cx, cy, 14)[1]}" x2="${top[0]}" y2="${top[1]}" stroke="#2a1f18" stroke-width="2"/>`;
      L.forEach(([c, dx, dy, r]) => { s += `<circle cx="${top[0] + dx}" cy="${top[1] + dy}" r="${r}" fill="${c}"/>`; });
      addFurni(cx + cy, `<g class="sway" style="transform-origin:${iso(cx, cy)[0]}px ${iso(cx, cy)[1]}px">${s}</g>`);
    }
    function lamp(x, y) {
      at([x, y]);
      block([x, y]);
      const cx = x + 0.5, cy = y + 0.5, b = iso(cx, cy), t = iso(cx, cy, 58);
      let s = `<ellipse cx="${b[0]}" cy="${b[1]}" rx="9" ry="4.5" fill="#0a1230" opacity=".6"/>`;
      s += `<line x1="${b[0]}" y1="${b[1]}" x2="${t[0]}" y2="${t[1]}" stroke="#9fadd8" stroke-width="2"/>`;
      s += `<path d="M${t[0] - 10} ${t[1] + 6} L${t[0] - 6} ${t[1] - 6} L${t[0] + 6} ${t[1] - 6} L${t[0] + 10} ${t[1] + 6} Z" fill="#ffd27a"/>`;
      s += `<ellipse cx="${t[0]}" cy="${t[1] + 6}" rx="10" ry="3" fill="#fff3c9"/>`;
      s += `<circle cx="${t[0]}" cy="${t[1] + 4}" r="26" fill="url(#gLamp)" class="lamp-halo"/>`;
      addFurni(cx + cy, s);
      return `<ellipse cx="${b[0]}" cy="${b[1]}" rx="92" ry="46" fill="url(#gLamp)"/>`;
    }
    function rack(x, y) {
      at([x, y]);
      block([x, y]);
      let s = box(x + 0.08, y + 0.08, 0, 0.84, 0.84, 82, { t: '#2f4a9e', l: '#1a2a5c', r: '#12204e' });
      // LEDs na face esquerda (+y)
      for (let row = 0; row < 7; row++) {
        const z = 12 + row * 10;
        const a = iso(x + 0.2, y + 0.92, z), b = iso(x + 0.8, y + 0.92, z);
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#0a1230" stroke-width="5"/>`;
        for (let k = 0; k < 3; k++) {
          const p = iso(x + 0.28 + k * 0.08, y + 0.92, z);
          const c = (row + k) % 4 === 0 ? '#ffd27a' : '#5bd1b5';
          s += `<circle cx="${p[0]}" cy="${p[1]}" r="1.3" fill="${c}" class="led" style="animation-delay:${((row * 3 + k) * 0.37) % 2.4}s"/>`;
        }
      }
      addFurni(x + y + 1, s);
    }
    function sofa(x, y, len) {
      at([x, y]);
      for (let i = 0; i < len; i++) block([x, y + i]);
      const c = { t: '#b7abff', l: '#a597ff', r: '#7d6fe0' };
      let s = box(x + 0.1, y + 0.08, 0, 0.8, len - 0.16, 14, c);
      s += box(x + 0.1, y + 0.08, 14, 0.24, len - 0.16, 18, { t: '#c3b9ff', l: '#9789f2', r: '#6f61d2' });
      s += box(x + 0.1, y + 0.02, 0, 0.8, 0.14, 24, { t: '#c3b9ff', l: '#9789f2', r: '#6f61d2' });
      s += box(x + 0.1, y + len - 0.16, 0, 0.8, 0.14, 24, { t: '#c3b9ff', l: '#9789f2', r: '#6f61d2' });
      addFurni(x + y + len * 0.5 + 0.4, s);
    }
    function table(x, y, w, d, h, top = '#d8a57a') {
      let s = box(x, y, 0, w, d, h - 3, { t: '#2a1f18', l: '#3a2c22', r: '#2a1f18' });
      s += box(x - 0.04, y - 0.04, h - 3, w + 0.08, d + 0.08, 3, { t: top, l: shade(top, -0.15), r: shade(top, -0.3) });
      return s;
    }
    function cabinet(x, y) {
      at([x, y]);
      block([x, y]);
      let s = box(x + 0.1, y + 0.1, 0, 0.8, 0.8, 44, { t: '#cfd6ea', l: '#aab5d4', r: '#8f9cc2' });
      [10, 24, 38].forEach(z => {
        const a = iso(x + 0.4, y + 0.9, z), b = iso(x + 0.6, y + 0.9, z);
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#0a1230" stroke-width="1.6" stroke-linecap="round"/>`;
      });
      addFurni(x + y + 1, s);
    }
    function coffee() {
      at([0, 6], [0, 7]);
      block([0, 6], [0, 7]);
      let s = table(0.08, 6.1, 0.8, 1.8, 30, '#eef2fb');
      s += box(0.2, 6.3, 30, 0.45, 0.45, 22, { t: '#3a3f55', l: '#2a2f45', r: '#1c2035' });
      const p = iso(0.42, 6.78, 40);
      s += `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#ff6b6b" class="blink"/>`;
      [[0.35, 7.2], [0.55, 7.5]].forEach(([mx, my]) => { s += box(mx, my, 30, 0.12, 0.12, 6, { t: '#2a1f18', l: '#f3f5ff', r: '#cfd6ea' }); });
      addFurni(7.4, s);
    }
    function beanbag(x, y, color) {
      at([x, y]);
      block([x, y]);
      const c = iso(x + 0.5, y + 0.5);
      const s = `<ellipse cx="${c[0]}" cy="${c[1]}" rx="20" ry="9" fill="#0a1230" opacity=".35"/>
        <path d="M${c[0] - 18} ${c[1] - 2} C ${c[0] - 20} ${c[1] - 22}, ${c[0] + 20} ${c[1] - 24}, ${c[0] + 18} ${c[1] - 2} C ${c[0] + 12} ${c[1] + 6}, ${c[0] - 12} ${c[1] + 6}, ${c[0] - 18} ${c[1] - 2} Z" fill="${color}"/>
        <path d="M${c[0] - 10} ${c[1] - 14} C ${c[0] - 4} ${c[1] - 20}, ${c[0] + 8} ${c[1] - 18}, ${c[0] + 10} ${c[1] - 12}" stroke="#fff" stroke-opacity=".3" stroke-width="2" fill="none"/>`;
      addFurni(x + y + 1, s);
    }

    // mesa + cadeira de cada agente
    function workstation(a) {
      at([a.seat[0], a.seat[1]]);
      const [sx, sy] = a.seat;
      const chairC = { t: '#3a4a86', l: '#2a3a7a', r: '#1e2b6b' };
      // cadeira
      let ch = box(sx + 0.22, sy + 0.22, 8, 0.56, 0.56, 6, chairC);
      if (a.facing === 1) ch = box(sx + 0.16, sy + 0.2, 8, 0.12, 0.6, 30, chairC) + ch;
      else ch = box(sx + 0.2, sy + 0.16, 8, 0.6, 0.12, 30, chairC) + ch;
      const base = iso(sx + 0.5, sy + 0.5);
      ch = `<ellipse cx="${base[0]}" cy="${base[1]}" rx="11" ry="5" fill="#0a1230" opacity=".5"/>` + ch;
      addFurni(sx + sy + 0.9, ch);

      if (a.desk && a.desk.kind === 'counter') {
        const d = a.desk;
        for (let i = 0; i < Math.ceil(d.w); i++) block([d.x + i, d.y]);
        let s = box(d.x, d.y, 0, d.w, d.d, d.h, { t: '#eef2fb', l: '#2f4a9e', r: '#22397f' });
        s += box(d.x, d.y + d.d - 0.06, 6, d.w, 0.06, 18, { t: '#ffd27a', l: '#ffd27a', r: '#f6b73c' });
        // monitor de costas
        // monitor na ponta do balcão, pra não tapar o rosto de quem atende
        s += box(d.x + 0.15, d.y + 0.15, d.h, 0.6, 0.06, 16, { t: '#2a3a7a', l: '#1a2a5c', r: '#12204e' });
        s += `<g class="screen-glow" data-for="${a.slug}"><circle cx="${iso(d.x + 0.5, d.y - 0.2, 40)[0]}" cy="${iso(d.x + 0.5, d.y - 0.2, 40)[1]}" r="26" fill="url(#gScreen)"/></g>`;
        // campainha
        s += box(d.x + d.w - 0.5, d.y + 0.3, d.h, 0.18, 0.18, 4, { t: '#ffd27a', l: '#f6b73c', r: '#c98f1c' });
        addFurni(d.x + d.y + d.w * 0.5 + 0.9, s);
        return;
      }

      const deskC = { t: '#d6ddf0', l: '#9fadd8', r: '#7f8db8' };
      let s = '', dx, dy, dw, dd, depth;
      if (a.facing === 1) { dx = sx + 1.08; dy = sy + 0.12; dw = 0.78; dd = 1.72; block([sx + 1, sy], [sx + 1, sy + 1]); }
      else { dx = sx + 0.12; dy = sy + 1.08; dw = 1.72; dd = 0.78; block([sx, sy + 1], [sx + 1, sy + 1]); }
      depth = dx + dy + (dw + dd) / 2;
      // pés
      const legC = { t: '#9fadd8', l: '#6f7fb0', r: '#56649a' };
      [[dx + 0.05, dy + 0.05], [dx + dw - 0.12, dy + 0.05], [dx + 0.05, dy + dd - 0.12], [dx + dw - 0.12, dy + dd - 0.12]].forEach(([lx, ly]) => { s += box(lx, ly, 0, 0.07, 0.07, 24, legC); });
      s += box(dx, dy, 24, dw, dd, 4, deskC);
      // monitor virado pro agente (vemos as costas), teclado e caneca
      if (a.facing === 1) {
        s += box(dx + 0.5, dy + 0.18, 28, 0.06, 0.72, 22, { t: '#2a3a7a', l: '#1a2a5c', r: '#12204e' });
        s += box(dx + 0.46, dy + 0.48, 28, 0.14, 0.12, 2, legC);
        s += box(dx + 0.12, dy + 0.25, 28, 0.22, 0.5, 2, { t: '#cfd6ea', l: '#9fadd8', r: '#8f9cc2' });
        s += box(dx + 0.3, dy + 1.4, 28, 0.14, 0.14, 7, { t: '#2a1f18', l: a.look.body, r: shade(a.look.body, -0.25) });
      } else {
        s += box(dx + 0.18, dy + 0.5, 28, 0.72, 0.06, 22, { t: '#2a3a7a', l: '#1a2a5c', r: '#12204e' });
        s += box(dx + 0.48, dy + 0.46, 28, 0.12, 0.14, 2, legC);
        s += box(dx + 0.25, dy + 0.12, 28, 0.5, 0.22, 2, { t: '#cfd6ea', l: '#9fadd8', r: '#8f9cc2' });
        s += box(dx + 1.4, dy + 0.3, 28, 0.14, 0.14, 7, { t: '#2a1f18', l: a.look.body, r: shade(a.look.body, -0.25) });
      }
      const g = a.facing === 1 ? iso(dx + 0.25, dy + 0.55, 46) : iso(dx + 0.55, dy + 0.25, 46);
      s += `<g class="screen-glow" data-for="${a.slug}"><circle cx="${g[0]}" cy="${g[1]}" r="30" fill="url(#gScreen)"/></g>`;
      addFurni(depth, s);
    }

    function buildFurniture() {
      const glows = [];
      // Hub
      sofa(0, 4, 2);
      block([1, 4], [1, 5]);
      at([1, 4]); addFurni(1.3 + 4.5 + 0.6, table(1.25, 4.3, 0.6, 1.4, 14));
      plant(6, 0, true);
      // Infra
      rack(19, 0); rack(20, 0); rack(21, 0);
      plant(21, 5, true);
      // corredor
      coffee();
      plant(20, 6, true);
      // Lab
      plant(10, 14, true);
      beanbag(9, 12, '#ffd27a');
      glows.push(lamp(0, 14));
      // Ops
      cabinet(20, 9); cabinet(21, 9);
      plant(21, 14, true);
      glows.push(lamp(11, 14));
      // salas automáticas: uma planta no canto do fundo (e no espaço livre, um puff)
      D.ROOMS.filter(r => r.auto).forEach(r => {
        if (r.y0 === 0) plant(r.x1, 0, true); else plant(r.x1, r.y1, true);
        if (r.empty) beanbag(r.x0 + 2, r.y0 + 3, '#5fd3b8');
      });
      D.AGENTS.forEach(workstation);
      return glows.join('');
    }

    // ───────────────────────── Olheiro (família do viunacidade)
    function hatSvg(type, c, body) {
      switch (type) {
        case 'bubble': return `<rect x="26" y="10" width="48" height="32" rx="13" fill="${c}"/><path d="M36 40 L32 52 L48 41 Z" fill="${c}"/><circle cx="39" cy="26" r="3.6" fill="#0a1230"/><circle cx="50" cy="26" r="3.6" fill="#0a1230"/><circle cx="61" cy="26" r="3.6" fill="#0a1230"/>`;
        case 'terminal': return `<rect x="24" y="12" width="52" height="38" rx="7" fill="${c}" stroke="#2f4a9a" stroke-width="2.5"/><path d="M33 24 L41 30 L33 36" stroke="#ffd27a" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect class="hat-cursor" x="45" y="34" width="14" height="3.6" rx="1.5" fill="#ffd27a"/>`;
        case 'cloud': return `<g fill="${c}"><circle cx="37" cy="36" r="12"/><circle cx="53" cy="27" r="16"/><circle cx="67" cy="38" r="11"/><rect x="26" y="36" width="50" height="14" rx="7"/></g><circle cx="46" cy="24" r="4" fill="#fff" opacity=".7"/>`;
        case 'radar': return `<rect x="46" y="32" width="8" height="20" rx="3" fill="${c}"/><path d="M24 30 Q48 58 76 18 Z" fill="${c}"/><path d="M30 31 Q49 48 70 23" stroke="#cfd6ea" stroke-width="2" fill="none"/><line x1="50" y1="34" x2="62" y2="16" stroke="#0a1230" stroke-width="2.4"/><circle class="hat-ping" cx="63" cy="14" r="4" fill="#ffd27a"/>`;
        case 'db': return [0, 1, 2].map(i => { const y = 40 - i * 12; return `<rect x="29" y="${y}" width="42" height="11" fill="${c}"/><ellipse cx="50" cy="${y + 11}" rx="21" ry="5" fill="${c}"/><ellipse cx="50" cy="${y}" rx="21" ry="5" fill="${shade(c, 0.35)}"/>`; }).join('');
        case 'hardhat': return `<path d="M22 50 Q22 18 50 18 Q78 18 78 50 Z" fill="${c}"/><rect x="14" y="45" width="72" height="8" rx="4" fill="#f6b73c"/><rect x="45" y="16" width="10" height="31" rx="5" fill="#ffe3a6"/>`;
        case 'atom': return `<rect x="47.5" y="36" width="5" height="16" rx="2" fill="#f3f5ff"/><ellipse cx="50" cy="26" rx="24" ry="8.5" fill="none" stroke="#f3f5ff" stroke-width="2.6" transform="rotate(-28 50 26)"/><ellipse cx="50" cy="26" rx="24" ry="8.5" fill="none" stroke="#f3f5ff" stroke-width="2.6" transform="rotate(28 50 26)"/><circle class="hat-ping" cx="50" cy="26" r="6.5" fill="${c}"/>`;
        case 'pin': return `<path d="M50 54 C40 42 33 35 33 26 A17 17 0 1 1 67 26 C67 35 60 42 50 54 Z" fill="${c}"/><circle cx="50" cy="25" r="7.5" fill="#0a1230"/><circle cx="52.5" cy="22.5" r="2.4" fill="#fff"/>`;
        case 'beret': return `<ellipse cx="54" cy="47" rx="32" ry="10" fill="${c}"/><ellipse cx="54" cy="43" rx="27" ry="8" fill="${shade(c, 0.18)}"/><rect x="52" y="30" width="5" height="9" rx="2.5" fill="${c}"/>`;
        case 'books': return `<rect x="24" y="40" width="52" height="11" rx="2" fill="${c}"/><rect x="28" y="29" width="46" height="11" rx="2" fill="#f08f6f"/><rect x="26" y="18" width="44" height="11" rx="2" fill="#ffd27a"/><rect x="70" y="42" width="4" height="7" fill="#f3f5ff"/><rect x="68" y="31" width="4" height="7" fill="#f3f5ff"/><rect x="64" y="20" width="4" height="7" fill="#f3f5ff"/>`;
        case 'grad': return `<rect x="34" y="34" width="32" height="17" rx="3" fill="${c}"/><polygon points="50,16 88,30 50,44 12,30" fill="${shade(c, 0.14)}"/><path d="M50 30 L80 34 L80 48" stroke="#ffd27a" stroke-width="2.4" fill="none"/><circle cx="80" cy="50" r="3.4" fill="#ffd27a"/>`;
        case 'calendar': return `<rect x="26" y="14" width="48" height="37" rx="7" fill="#f3f5ff"/><path d="M26 21 A7 7 0 0 1 33 14 H67 A7 7 0 0 1 74 21 V27 H26 Z" fill="${c}"/><rect x="36" y="9" width="5" height="11" rx="2.5" fill="#0a1230"/><rect x="59" y="9" width="5" height="11" rx="2.5" fill="#0a1230"/><text x="50" y="45" class="hat-day">${todayDay()}</text>`;
        case 'bulb': return `<rect x="42" y="38" width="16" height="13" rx="3" fill="#9fadd8"/><rect x="42" y="42" width="16" height="2" fill="#6f7fb0"/><circle class="hat-bulb" cx="50" cy="25" r="16" fill="${c}"/><path d="M44 30 L47 22 L50 28 L53 22 L56 30" stroke="#c98f1c" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
        case 'crown': return `<path d="M28 50 L28 26 L39 36 L50 18 L61 36 L72 26 L72 50 Z" fill="${c}"/><circle cx="50" cy="16" r="4" fill="#fff3c9"/>`;
        default: return '';
      }
    }
    function todayDay() {
      try { return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date()); } catch (e) { return String(new Date().getDate()); }
    }

    // roupas por cima do corpo (sempre deixam olhos e boca livres)
    function outfitBack(type, c) {
      if (type === 'cape') return `<path d="M10 58 Q3 100 1 133 H99 Q97 100 90 58 Z" fill="${c}"/><path d="M10 58 Q3 100 1 133 H12 Q10 100 14 60Z" fill="#0a1230" opacity=".18"/>`;
      return '';
    }
    function outfitFront(type, c) {
      const hi = shade(c, 0.28), lo = shade(c, -0.25);
      switch (type) {
        case 'scarf': return `<rect x="10" y="99" width="80" height="10" rx="5" fill="${c}"/><rect x="66" y="104" width="11" height="22" rx="4" fill="${c}"/><path d="M66 118 H77 M66 122 H77" stroke="${hi}" stroke-width="2"/><rect x="10" y="99" width="80" height="3" rx="1.5" fill="#fff" opacity=".2"/>`;
        case 'bowtie': return `<path d="M50 104 L37 98 L37 110 Z" fill="${c}"/><path d="M50 104 L63 98 L63 110 Z" fill="${c}"/><circle cx="50" cy="104" r="3.6" fill="${lo}"/>`;
        case 'vest': return `<path d="M12 101 H35 L41 128 H27 A15 15 0 0 1 12 113 Z" fill="${c}"/><path d="M88 101 H65 L59 128 H73 A15 15 0 0 0 88 113 Z" fill="${c}"/><circle cx="37" cy="112" r="1.8" fill="${hi}"/><circle cx="38.5" cy="121" r="1.8" fill="${hi}"/>`;
        case 'hoodie': return `<path d="M12 74 V65 A15 15 0 0 1 27 50 H73 A15 15 0 0 1 88 65 V74 H83 V63 Q83 57 76 57 H24 Q17 57 17 63 V74 Z" fill="${c}"/><path d="M40 100 V112 M60 100 V112" stroke="${hi}" stroke-width="2.2" stroke-linecap="round"/><circle cx="40" cy="113" r="2" fill="${hi}"/><circle cx="60" cy="113" r="2" fill="${hi}"/>`;
        case 'badge': return `<path d="M60 99 L68 106 M80 99 L72 106" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><rect x="61" y="105" width="20" height="21" rx="3.5" fill="#f3f5ff" stroke="${c}" stroke-width="2"/><rect x="65" y="109" width="7" height="7" rx="1.5" fill="${c}"/><rect x="65" y="119" width="12" height="2.4" rx="1.2" fill="${c}"/>`;
        case 'cape': return `<path d="M12 56 L26 50 L20 64 Z M88 56 L74 50 L80 64 Z" fill="${c}"/><circle cx="50" cy="101" r="3.2" fill="#ffd27a"/>`;
        case 'headphones': return `<path d="M15 72 Q15 33 50 33 Q85 33 85 72" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/><rect x="5" y="66" width="14" height="24" rx="7" fill="${c}"/><rect x="81" y="66" width="14" height="24" rx="7" fill="${c}"/><rect x="8" y="70" width="4" height="16" rx="2" fill="${hi}"/>`;
        default: return '';
      }
    }

    function olheiroInner(look) {
      const b = look.body;
      const oc = look.outfitColor || '#0a1230';
      return `
        <g class="ol-feet">
          <ellipse class="ol-foot-l" cx="32" cy="131" rx="10" ry="4.5" fill="#0a1230" fill-opacity=".6"/>
          <ellipse class="ol-foot-r" cx="68" cy="131" rx="10" ry="4.5" fill="#0a1230" fill-opacity=".6"/>
        </g>
        <g class="ol-body">
          ${outfitBack(look.outfit, oc)}
          <rect x="12" y="50" width="76" height="78" rx="15" fill="${b}"/>
          <path d="M27 50H73A15 15 0 0 1 88 65V74H12V65A15 15 0 0 1 27 50Z" fill="#fff" opacity=".22"/>
          <path d="M12 108H88V113A15 15 0 0 1 73 128H27A15 15 0 0 1 12 113Z" fill="#0a1230" opacity=".18"/>
          <ellipse cx="23" cy="105" rx="5" ry="3" fill="#ff7a9a" fill-opacity=".55"/>
          <ellipse cx="77" cy="105" rx="5" ry="3" fill="#ff7a9a" fill-opacity=".55"/>
          <rect class="ol-mouth" x="43" y="110" width="14" height="13" rx="7" fill="#0a1230" fill-opacity=".55"/>
          <g class="ol-eyes">
            <rect class="ol-frame" x="17" y="63" width="32" height="36" rx="10" fill="#ffd27a"/>
            <rect class="ol-frame" x="51" y="63" width="32" height="36" rx="10" fill="#ffd27a"/>
            <rect x="22" y="68" width="22" height="26" rx="6" fill="#fff4c9" stroke="#0a1230" stroke-opacity=".3" stroke-width="2"/>
            <rect x="56" y="68" width="22" height="26" rx="6" fill="#fff4c9" stroke="#0a1230" stroke-opacity=".3" stroke-width="2"/>
            <g class="ol-pupils">
              <circle cx="33" cy="82" r="6" fill="#0a1230"/><circle cx="67" cy="82" r="6" fill="#0a1230"/>
              <circle cx="30.5" cy="79.5" r="2" fill="#fff"/><circle cx="64.5" cy="79.5" r="2" fill="#fff"/>
            </g>
            <rect class="ol-lid" x="17" y="63" width="66" height="0" fill="${b}"/>
          </g>
          <g class="ol-outfit">${outfitFront(look.outfit, oc)}</g>
          <g class="ol-hat">${hatSvg(look.hat, look.hatColor, b)}</g>
          <g class="ol-carry" opacity="0">
            <rect x="70" y="96" width="26" height="20" rx="4" fill="#ffd27a" stroke="#0a1230" stroke-width="2.5"/>
            <path d="M75 103 H90 M75 109 H85" stroke="#0a1230" stroke-width="2.5" stroke-linecap="round"/>
          </g>
        </g>`;
    }
    function olheiroStandalone(look, w = 76) {
      return `<svg viewBox="0 -16 100 156" width="${w}" height="${w * 1.56}" aria-hidden="true" style="overflow:visible">${olheiroInner(look)}</svg>`;
    }

    return {
      TW, TH, WALL_H, PART_H, SLAB, W, H,
      iso, P, esc, shade, box, tone, wallM, floorM,
      blocked, key, inside, roomAt, furniture, addFurni, block,
      buildDefs, buildBase, buildWalls, windowSvg, logoMark, buildPartitions, post,
      plant, lamp, rack, sofa, table, cabinet, coffee, beanbag, workstation, buildFurniture,
      hatSvg, todayDay, olheiroInner, olheiroStandalone, outfitBack, outfitFront,
      wallSign, wallClock, elevator, warPanel, whiteboard, cafeBoard, moonSvg
    };
  }

  root.AO_SPRITES = { createScene, TW, TH, WALL_H, PART_H, SLAB };
})(typeof window !== 'undefined' ? window : globalThis);
