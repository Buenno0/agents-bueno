#!/usr/bin/env node
// Gera o registro da senha do Comandante para AGENT_OFFICE_ADMIN_PASSWORD_HASH.
// A senha não aparece na tela, não vai pro histórico do terminal e não é salva em lugar nenhum.
//
//   node scripts/gerar-senha.mjs
//
// Usa os mesmos parâmetros do server.mjs: scrypt N=32768, r=8, p=3, salt aleatório de 16 bytes.
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const MIN = 12;

function ask(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stderr.write(prompt);
    if (!input.isTTY) {
      // modo não interativo (ex.: testes): lê a próxima linha da entrada
      let buf = "";
      const onData = chunk => {
        buf += chunk;
        const i = buf.indexOf("\n");
        if (i >= 0) { input.off("data", onData); input.pause(); process.stderr.write("\n"); resolve(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); input.unshift(Buffer.from(buf)); }
      };
      input.setEncoding("utf8"); input.on("data", onData); input.resume();
      return;
    }
    let value = "";
    input.setRawMode(true); input.resume(); input.setEncoding("utf8");
    const onData = key => {
      for (const ch of key) {
        if (ch === "\u0003") { input.setRawMode(false); process.stderr.write("\n"); reject(new Error("cancelado")); return; }
        if (ch === "\r" || ch === "\n") { input.setRawMode(false); input.pause(); input.off("data", onData); process.stderr.write("\n"); resolve(value); return; }
        if (ch === "\u007f" || ch === "\b") { if (value) { value = value.slice(0, -1); process.stderr.write("\b \b"); } continue; }
        if (ch >= " ") { value += ch; process.stderr.write("•"); }
      }
    };
    input.on("data", onData);
  });
}

try {
  const first = await ask(`Senha nova do Comandante (mínimo ${MIN} caracteres): `);
  if ([...first].length < MIN) throw new Error(`a senha precisa ter pelo menos ${MIN} caracteres`);
  if (Buffer.byteLength(first) > 1024) throw new Error("a senha é longa demais");
  const second = await ask("Repita a senha: ");
  if (first !== second) throw new Error("as duas senhas não são iguais");
  const salt = randomBytes(16);
  const hash = await derive(first, salt, 32, OPTIONS);
  process.stderr.write("\nCopie a linha abaixo para /etc/agent-office/admin.env na VPS:\n\n");
  process.stdout.write(`AGENT_OFFICE_ADMIN_PASSWORD_HASH=scrypt:${salt.toString("hex")}:${hash.toString("hex")}\n`);
  process.stderr.write("\nGuarde a senha num gerenciador de senhas. O registro acima não permite descobrir a senha.\n");
} catch (error) {
  process.stderr.write(`\nErro: ${error.message}\n`);
  process.exit(1);
}
