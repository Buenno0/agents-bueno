#!/usr/bin/env node
// Gera ../prototype/index.html (arquivo único) a partir de office-design/.
// O server.mjs só serve "/" e libera <script> inline por hash (CSP), então tudo vai embutido:
// CSS em <style>, dados e motor em <script> sem atributos, logo inline e favicon em data: URI.
import fs from "node:fs";
import path from "node:path";

const root = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const out = path.resolve(root, "../prototype/index.html");

// carimba a versão nos links do office-design/index.html (navegador nunca usa arquivo velho)
import crypto from "node:crypto";
{
  const src = read("index.html");
  const v = crypto.createHash("sha1").update(["assets/styles.css", "assets/data.js", "assets/layout.js", "assets/sprites.js", "assets/app.js"].map(read).join("")).digest("hex").slice(0, 8);
  const stamped = src.replace(/(\.\/assets\/(?:styles\.css|data\.js|layout\.js|sprites\.js|app\.js))(\?v=[a-z0-9]+)?/g, `$1?v=${v}`);
  if (stamped !== src) fs.writeFileSync(path.join(root, "index.html"), stamped);
}
let html = read("index.html").replace(/\?v=[a-z0-9]+/g, "");
const css = read("assets/styles.css");
const data = read("assets/data.js");
const layout = read("assets/layout.js");
const sprites = read("assets/sprites.js");
const app = read("assets/app.js");
const logo = read("assets/logo-agent-office.svg").trim().replace("<svg ", '<svg width="30" height="30" aria-hidden="true" ');
const favicon = "data:image/svg+xml;base64," + Buffer.from(read("assets/favicon.svg")).toString("base64");

for (const [name, src] of [["data.js", data], ["layout.js", layout], ["sprites.js", sprites], ["app.js", app]]) {
  if (/<\/script/i.test(src)) throw new Error(`${name} contém </script>`);
}

const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`marcador não encontrado: ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />', `<link rel="icon" type="image/svg+xml" href="${favicon}" />`);
swap('<link rel="stylesheet" href="./assets/styles.css" />', `<style>\n${css}\n</style>`);
// o logo já vem embutido no index.html
swap('<script src="./assets/data.js"></script>\n  <script src="./assets/layout.js"></script>\n  <script src="./assets/sprites.js"></script>\n  <script src="./assets/app.js"></script>', `<script>\n${data}\n</script>\n  <script>\n${layout}\n</script>\n  <script>\n${sprites}\n</script>\n  <script>\n${app}\n</script>`);

if (/(src|href)="\.\/assets\//.test(html)) throw new Error("sobrou referência a ./assets/");
fs.writeFileSync(out, html);
console.log(`ok: ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(1)} KiB)`);
