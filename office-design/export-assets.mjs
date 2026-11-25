#!/usr/bin/env node
// Exporta cada elemento do escritório como SVG avulso em assets/sprites/
// e gera assets.html (catálogo visual). Usa o mesmo sprites.js do app, então nada diverge.
//   node office-design/export-assets.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = import.meta.dirname;
const outDir = path.join(root, "assets/sprites");
const ctx = vm.createContext({ globalThis: {}, Intl, Math, String, Number, Array, Object, Set, Map, JSON, Date });
ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(root, "assets/data.js"), "utf8").replace("window.AO_DATA", "globalThis.AO_DATA"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/layout.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/sprites.js"), "utf8"), ctx);
const D = ctx.AO_DATA;
const { createScene } = ctx.AO_SPRITES;
const fresh = (over = {}) => createScene({ ...D, ...over });
const S0 = fresh();
const { iso, WALL_H, SLAB, W, H } = S0;

const STYLE = `<style>
.floor-paint{font-family:Outfit,ui-sans-serif,sans-serif;font-weight:600;letter-spacing:3px;fill:#fff;fill-opacity:.075}
.wall-brand{font-family:Outfit,ui-sans-serif,sans-serif;font-weight:500;font-size:17px;letter-spacing:-.3px;fill:#f3f5ff}
.wall-num{font-family:Manrope,ui-sans-serif,sans-serif;font-weight:800;font-size:8px;fill:#ffd27a;text-anchor:middle}
.wall-cafe{font-family:Outfit,ui-sans-serif,sans-serif;font-weight:500;font-size:11px;fill:#ffd27a;text-anchor:middle}
.hat-day{font-family:Outfit,ui-sans-serif,sans-serif;font-weight:600;font-size:17px;fill:#0a1230;text-anchor:middle}
.screen-glow{opacity:0}.screen-glow.on{opacity:1}
.led,.blink,.hat-cursor{animation:k-led 2.4s steps(2,jump-none) infinite}.blink{animation-duration:1.6s}.hat-cursor{animation-duration:1s}
.tw{animation:k-tw 2.6s ease-in-out infinite alternate}
@keyframes k-led{50%{opacity:.25}}@keyframes k-tw{from{opacity:.6}to{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`;

// caixa envolvente de uma peça isométrica: tiles [x,y]→[x+fw,y+fd], altura h (px), margem m
function isoBounds(x, y, fw, fd, h, m = 8, below = 0) {
  const pts = [];
  for (const [a, b] of [[x, y], [x + fw, y], [x, y + fd], [x + fw, y + fd]]) pts.push(iso(a, b, -below), iso(a, b, h));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) - Math.min(...xs) + 2 * m, Math.max(...ys) - Math.min(...ys) + 2 * m];
}
function doc(vb, inner, scale = 2) {
  const [x, y, w, h] = vb.map(v => +v.toFixed(1));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}">${STYLE}${S0.buildDefs()}${inner}</svg>\n`;
}
const sortedFurni = (S) => S.furniture.slice().sort((a, b) => a.depth - b.depth).map(f => f.svg).join("");

const manifest = [];
function write(group, name, label, svg, note = "") {
  const rel = `${group}/${name}.svg`;
  fs.mkdirSync(path.join(outDir, group), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), svg);
  manifest.push({ group, name, label, file: `assets/sprites/${rel}`, note });
}

fs.rmSync(outDir, { recursive: true, force: true });

// ── Olheiros
const OL_VB = [-4, -20, 108, 160];
for (const a of D.AGENTS) {
  write("olheiros", a.slug, a.shortName, doc(OL_VB, S0.olheiroInner(a.look), 2.4), a.roleTitle);
}
write("olheiros", "voce", "Você", doc(OL_VB, S0.olheiroInner({ body: "#f3f5ff", hat: "crown", hatColor: "#ffd27a" }), 2.4), "Avatar do modo Comandante");
write("olheiros", "olheiro-base", "Olheiro base", doc(OL_VB, S0.olheiroInner({ body: "#a597ff", hat: "none", hatColor: "#000" }), 2.4), "Sem chapéu, cor do Viu");
write("olheiros", "olheiro-carregando", "Carregando tarefa", doc(OL_VB, S0.olheiroInner(D.AGENTS[0].look).replace('class="ol-carry" opacity="0"', 'class="ol-carry" opacity="1"'), 2.4), "Estado de entrega");

// ── Chapéus
for (const h of D.WARDROBE.hats.filter(h => h.key !== "none")) write("chapeus", h.key, h.label, doc([4, 2, 92, 56], S0.hatSvg(h.key, h.color), 3));

// ── Roupas (num Olheiro base, cor do Viu)
for (const o of D.WARDROBE.outfits.filter(o => o.key !== "none")) {
  write("roupas", o.key, o.label, doc(OL_VB, S0.olheiroInner({ body: "#a597ff", hat: "none", hatColor: "#000", outfit: o.key, outfitColor: "#3563d9" }), 2.4));
}

// ── Móveis (cada um num cenário novo, na origem)
function furni(name, label, fn, b, note) {
  const S = fresh();
  const glow = fn(S) || "";
  write("moveis", name, label, doc(isoBounds(...b), glow + sortedFurni(S)), note);
}
furni("planta", "Planta", S => { S.plant(0, 0, false); }, [0, 0, 1, 1, 56]);
furni("planta-alta", "Planta alta", S => { S.plant(0, 0, true); }, [0, 0, 1, 1, 78]);
furni("abajur", "Abajur", S => S.lamp(0, 0), [0, 0, 1, 1, 80, 30], "Com a poça de luz no chão");
furni("rack", "Rack de servidor", S => { S.rack(0, 0); }, [0, 0, 1, 1, 86]);
furni("sofa", "Sofá", S => { S.sofa(0, 0, 2); }, [0, 0, 1, 2, 30]);
furni("mesa-de-centro", "Mesa de centro", S => { S.addFurni(0, S.table(0.1, 0.1, 0.6, 1.4, 14)); }, [0, 0, 0.8, 1.6, 16]);
furni("arquivo", "Arquivo de aço", S => { S.cabinet(0, 0); }, [0, 0, 1, 1, 48]);
furni("cafe", "Estação de café", S => { S.coffee(); }, [0, 6, 1, 2, 56]);
furni("puff-rosa", "Puff rosa", S => { S.beanbag(0, 0, "#ff7cb8"); }, [0, 0, 1, 1, 26]);
furni("puff-amarelo", "Puff amarelo", S => { S.beanbag(0, 0, "#ffd27a"); }, [0, 0, 1, 1, 26]);
furni("puff-menta", "Puff menta", S => { S.beanbag(0, 0, "#5fd3b8"); }, [0, 0, 1, 1, 26]);
const desk = (facing) => ({ slug: "x", seat: [0, 0], facing, look: { body: "#a597ff" } });
furni("estacao-a", "Mesa + cadeira (lado A)", S => { S.workstation(desk(1)); }, [0, 0, 2, 2, 56], "Agente olha pra direita");
furni("estacao-b", "Mesa + cadeira (lado B)", S => { S.workstation(desk(-1)); }, [0, 0, 2, 2, 56], "Agente olha pra esquerda");
{
  const S = fresh(); S.workstation(desk(1));
  write("moveis", "estacao-a-ligada", "Mesa com monitor aceso", doc(isoBounds(0, 0, 2, 2, 56), sortedFurni(S).replace(/class="screen-glow"/g, 'class="screen-glow on"')), "Estado trabalhando");
}
furni("balcao", "Balcão da recepção", S => { const o = D.AGENTS[0]; S.workstation({ ...o, seat: [1, 0], desk: { ...o.desk, x: 0, y: 1 } }); }, [0, 0, 3, 2, 56]);
// divisórias: plantas próprias, só com o trecho de vidro
{
  for (const [name, label, doors, len] of [["divisoria", "Mureta entre salas", [], 3], ["divisoria-porta", "Mureta com porta", [1, 2], 4]]) {
    const S = fresh({ PARTITIONS: [{ axis: "y", at: 1, from: 0, to: len, doors }] });
    S.buildPartitions();
    write("moveis", name, label, doc(isoBounds(0, 1, len, 0, 34), sortedFurni(S)));
  }
}

// ── Parede e o que vai nela
function wallPiece(name, label, wall, u0, u1, inner) {
  const face = wall === "y0"
    ? S0.P(iso(u0, 0), iso(u1, 0), iso(u1, 0, WALL_H), iso(u0, 0, WALL_H))
    : S0.P(iso(0, u0), iso(0, u1), iso(0, u1, WALL_H), iso(0, u0, WALL_H));
  const fill = wall === "y0" ? "#1d306c" : "#16275e";
  const b = wall === "y0" ? isoBounds(u0, 0, u1 - u0, 0, WALL_H, 8) : isoBounds(0, u0, 0, u1 - u0, WALL_H, 8);
  write("parede", name, label, doc(b, `<polygon points="${face}" fill="${fill}"/>${inner}`));
}
wallPiece("janela-lua", "Janela com lua", "y0", 7.3, 10.8, S0.windowSvg("y0", 7.5, 10.6, 30, 98, 11, true));
wallPiece("janela", "Janela", "y0", 15.2, 18.8, S0.windowSvg("y0", 15.4, 18.6, 30, 98, 23));
wallPiece("letreiro", "Letreiro da recepção", "y0", 1.9, 5.9, S0.wallSign());
wallPiece("relogio", "Relógio de parede", "y0", 0.3, 1.8, S0.wallClock());
wallPiece("elevador", "Elevador do 13º", "x0", 1.9, 4.1, S0.elevator());
wallPiece("painel-war-room", "Painel da War Room", "y0", 10.9, 15.2, S0.warPanel());
wallPiece("lousa", "Lousa do Lab", "x0", 10, 13, S0.whiteboard());
wallPiece("quadro-cafe", "Quadro do café", "x0", 6.1, 7.95, S0.cafeBoard());

// ── Piso
for (const r of D.ROOMS) {
  let s = "";
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
    s += `<polygon points="${S0.P(iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1))}" fill="${r.floor[(x + y) % 2]}" stroke="#ffffff" stroke-opacity=".035"/>`;
  }
  write("piso", `piso-${r.key}`, `Piso ${r.name}`, doc(isoBounds(0, 0, 2, 2, 0, 4), s));
}

// ── Marca e céu
write("marca", "logo", "Logo", fs.readFileSync(path.join(root, "assets/logo-agent-office.svg"), "utf8"));
write("marca", "favicon", "Favicon", fs.readFileSync(path.join(root, "assets/favicon.svg"), "utf8"));
write("marca", "lua-com-olho", "Lua com olho", S0.moonSvg(176, true).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '), "Easter egg do modo Visitante");
write("marca", "lua-dormindo", "Lua dormindo", S0.moonSvg(176, false).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '), "Modo Comandante");

// ── Andar inteiro (e um exemplo com grupos novos, montado pela planta automática)
function floor(Dx, nameEmpty, labelEmpty, nameFull, labelFull, note = "") {
  const S = createScene(Dx);
  const glows = S.buildFurniture(); S.buildPartitions();
  const W2 = Dx.FLOOR.w;
  const vb = [-H * 32 - 40, -WALL_H - 40, (W2 + H) * 32 + 80, (W2 + H) * 16 + WALL_H + SLAB + 80];
  const back = S.buildBase() + glows + S.buildWalls();
  if (nameEmpty) write("andar", nameEmpty, labelEmpty, doc(vb, back + sortedFurni(S), 1.5));
  const items = S.furniture.map(f => [f.depth, f.svg]);
  for (const a of Dx.AGENTS) {
    const [px, py] = iso(a.seat[0] + 0.5, a.seat[1] + 0.5);
    const k = 0.5, by = a.status === "working" || a.status === "queued" ? 4 : 0;
    items.push([a.seat[0] + a.seat[1] + 1, `<g transform="translate(${px} ${py})"><ellipse rx="17" ry="7" fill="#05091e" opacity=".45"/><g transform="translate(${-50 * k} ${-133 * k + by}) scale(${k})">${S.olheiroInner(a.look)}</g></g>`]);
  }
  const lit = items.sort((p, q) => p[0] - q[0]).map(i => i[1]).join("");
  const on = Dx.AGENTS.filter(a => a.status === "working").map(a => a.slug);
  const withGlow = lit.replace(/class="screen-glow" data-for="([^"]+)"/g, (m, s) => on.includes(s) ? `class="screen-glow on" data-for="${s}"` : m);
  write("andar", nameFull, labelFull, doc(vb, back + withGlow, 1.5), note);
}
floor(ctx.AO_LAYOUT.build(D, []), "andar-vazio", "Andar sem ninguém", "andar-completo", "Andar com os 13");
{
  const mk = (slug, displayName, room, status = "ready") => ({ slug, displayName, roleTitle: "Exemplo", room, status, lastActiveRelative: "hoje" });
  const demo = [mk("fin-1", "Caixa — Contas", "Financeiro", "working"), mk("fin-2", "Nota — Fiscal", "Financeiro"), mk("fin-3", "Cobra — Lembretes", "Financeiro"),
    mk("mkt-1", "Post — Redes", "Marketing", "working"), mk("mkt-2", "Mira — Anúncios", "Marketing")];
  floor(ctx.AO_LAYOUT.build(D, demo), null, null, "andar-com-grupos-novos", "Exemplo: 2 grupos novos", "Financeiro e Marketing viraram salas sozinhos");
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

// ── Catálogo
const GROUPS = { andar: "Andar", olheiros: "Olheiros", roupas: "Roupas", chapeus: "Chapéus", moveis: "Móveis", parede: "Parede", piso: "Piso", marca: "Marca e céu" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const cards = Object.entries(GROUPS).map(([g, title]) => {
  const items = manifest.filter(m => m.group === g);
  return `<section><h2>${title} <span>${items.length}</span></h2><div class="grid ${g === "andar" ? "wide" : ""}">${items.map(m => `
    <figure><a href="${m.file}" target="_blank" rel="noopener"><img src="${m.file}" alt="${esc(m.label)}" loading="lazy"></a>
    <figcaption><b>${esc(m.label)}</b>${m.note ? `<span>${esc(m.note)}</span>` : ""}<a class="dl" href="${m.file}" download>${esc(m.file.split("/").pop())}</a></figcaption></figure>`).join("")}</div></section>`;
}).join("\n");
fs.writeFileSync(path.join(root, "assets.html"), `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Office · Assets</title><link rel="icon" type="image/svg+xml" href="./assets/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500&family=Manrope:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--c0:#070d2a;--c1:#0c1945;--c2:#152a62;--ink:#f3f5ff;--muted:#a9b3d9;--line:rgba(255,255,255,.12);--luz:#ffd27a}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,var(--c0),var(--c1) 40%,var(--c2));background-attachment:fixed;color:var(--ink);font:500 14px/1.5 Manrope,ui-sans-serif,sans-serif}
header{max-width:1240px;margin:0 auto;padding:40px 24px 8px}h1{margin:0;font:300 clamp(34px,5vw,52px)/1.05 Outfit,sans-serif;letter-spacing:-.045em}
header p{color:var(--muted);max-width:60ch}header a{color:var(--luz)}
main{max-width:1240px;margin:0 auto;padding:8px 24px 60px}
h2{font:500 20px Outfit,sans-serif;margin:36px 0 14px;letter-spacing:-.01em}h2 span{font:700 12px Manrope;color:var(--muted);margin-left:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.grid.wide{grid-template-columns:repeat(auto-fill,minmax(min(560px,100%),1fr))}
figure{margin:0;border:1px solid var(--line);border-radius:16px;background:rgba(7,13,42,.55);overflow:hidden;display:flex;flex-direction:column}
figure>a{display:block;aspect-ratio:1;padding:16px;overflow:hidden;background:radial-gradient(circle at 50% 70%,rgba(53,99,217,.25),transparent 70%)}
.wide figure>a{aspect-ratio:16/10}
figure img{width:100%;height:100%;object-fit:contain;min-height:0}
figcaption{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px;border-top:1px solid var(--line)}
figcaption b{font-weight:700}figcaption span{font-size:12px;color:var(--muted)}
.dl{font:500 11.5px ui-monospace,Menlo,monospace;color:var(--luz);text-decoration:none;margin-top:4px}.dl:hover{text-decoration:underline}
</style></head><body>
<header><h1>Assets do escritório</h1><p>${manifest.length} SVGs vetoriais gerados do mesmo código que desenha o <a href="./">escritório</a>. Clique pra abrir em tamanho real ou baixe o arquivo. Pra regerar: <code>node office-design/export-assets.mjs</code>.</p></header>
<main>${cards}</main></body></html>
`);
console.log(`ok: ${manifest.length} assets em ${path.relative(process.cwd(), outDir)} + assets.html`);
