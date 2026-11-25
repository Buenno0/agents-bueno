import fs from "node:fs"; import vm from "node:vm";
// Testa a planta automática: toda mesa alcança todos os agentes, nada sobreposto.
//   node scripts/test-layout.mjs [pasta dos assets]
const dir = process.argv[2] || new URL("../office-design/assets", import.meta.url).pathname;
const ctx = vm.createContext({ Intl, Math, JSON, String, Number, Array, Object, Set, Map, Date }); ctx.globalThis = ctx;
for (const f of ["data.js", "layout.js", "sprites.js"]) vm.runInContext(fs.readFileSync(`${dir}/${f}`, "utf8").replace("window.AO_DATA", "globalThis.AO_DATA"), ctx);
const mk = (slug, room) => ({ slug, displayName: slug, roleTitle: "Teste", room, status: "ready", lastActiveRelative: "hoje" });
const cases = {
  "nenhum": [],
  "1 grupo, 1 agente": [mk("a1", "Financeiro")],
  "2 grupos 3+5": [...[1,2,3].map(i => mk("f"+i, "Financeiro")), ...[1,2,3,4,5].map(i => mk("m"+i, "Marketing"))],
  "3 grupos + anexo": [...[1,2].map(i => mk("f"+i, "Financeiro")), ...[1,2,3,4,5,6,7].map(i => mk("j"+i, "Jurídico")), mk("x1", "War Room Infra"), mk("v1", "Vendas")],
  "grupo grande 11": [...Array.from({length: 11}, (_, i) => mk("g"+i, "Grandão"))],
};
let fail = 0;
for (const [name, extras] of Object.entries(cases)) {
  const D = ctx.AO_LAYOUT.build(ctx.AO_DATA, extras);
  const S = ctx.AO_SPRITES.createScene(D); S.buildFurniture(); S.buildPartitions();
  const nav = ctx.AO_LAYOUT.createNav(D, S.blocked);
  const errs = [];
  const seats = new Set();
  for (let x = 0; x < D.FLOOR.w; x++) for (let y = 0; y < D.FLOOR.h; y++) if (!S.roomAt(x, y)) errs.push(`sem sala em ${x},${y}`);
  for (const a of D.AGENTS) {
    const k = a.seat.join(",");
    if (seats.has(k)) errs.push(`mesa repetida ${a.slug}`); seats.add(k);
    if (!nav.walkable(...a.seat)) errs.push(`assento bloqueado ${a.slug} ${k}`);
    if (!nav.walkable(...a.visit)) errs.push(`visita bloqueada ${a.slug} ${a.visit}`);
  }
  for (const a of D.AGENTS) for (const b of D.AGENTS) {
    if (a === b) continue;
    if (nav.findPath(...a.seat, ...b.visit) === null) errs.push(`sem caminho ${a.slug} -> ${b.slug}`);
  }
  const auto = D.ROOMS.filter(r => r.auto).map(r => `${r.name}[${r.x0}-${r.x1},${r.y0}]`).join(" ");
  console.log(`${errs.length ? "FALHA" : "ok   "} ${name}: largura ${D.FLOOR.w}, ${D.AGENTS.length} agentes ${auto}`);
  if (errs.length) { fail++; console.log("   " + [...new Set(errs)].slice(0, 8).join("\n   ")); }
}
process.exit(fail ? 1 : 0);
