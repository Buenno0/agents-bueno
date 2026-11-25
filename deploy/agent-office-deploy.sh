#!/usr/bin/env bash
# Instala uma versão do Agent Office enviada pelo GitHub Actions.
# Fica em /usr/local/bin/agent-office-deploy (root:root, 755) e é o ÚNICO comando
# que o usuário de deploy pode rodar com sudo. Uso: agent-office-deploy /tmp/agent-office-release-<sha>
set -euo pipefail

SRC="${1:-}"
if [[ ! "$SRC" =~ ^/tmp/agent-office-release-[0-9a-f]{40}$ ]] || [[ ! -d "$SRC" ]]; then
  echo "pasta de release inválida" >&2; exit 2
fi
cd "$SRC"
for f in index.html server.mjs commander.html SHA256SUMS; do
  [[ -f "$f" && ! -L "$f" ]] || { echo "faltando: $f" >&2; exit 2; }
done
sha256sum --quiet -c SHA256SUMS
node --check server.mjs

ROOT=/opt/agent-office
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="$ROOT/backup/$TS"
mkdir -p "$BACKUP" "$ROOT/prototype" "$ROOT/server"
cp -a "$ROOT/prototype" "$ROOT/server" "$BACKUP"/ 2>/dev/null || true

install -m 644 -o root -g root index.html     "$ROOT/prototype/index.html"
install -m 644 -o root -g root server.mjs     "$ROOT/server/server.mjs"
install -m 644 -o root -g root commander.html "$ROOT/server/commander.html"

restore() {
  echo "falhou: voltando para $BACKUP" >&2
  cp -a "$BACKUP/prototype/." "$ROOT/prototype/"
  cp -a "$BACKUP/server/."    "$ROOT/server/"
  systemctl restart agent-office
  exit 1
}

systemctl restart agent-office
ok=0
for _ in $(seq 1 15); do
  if curl -fsS -m 2 http://127.0.0.1:8788/healthz >/dev/null && \
     [[ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:8788/)" == "200" ]]; then ok=1; break; fi
  sleep 1
done
[[ $ok == 1 ]] || restore

# O Comandante só reinicia se já estiver ligado (ele não é ligado por este script).
if systemctl is-active --quiet agent-office-admin; then systemctl restart agent-office-admin; fi

# guarda só os 5 backups mais recentes
ls -1dt "$ROOT"/backup/* 2>/dev/null | tail -n +6 | xargs -r rm -rf
rm -rf "$SRC"
echo "ok: $(sha256sum "$ROOT/prototype/index.html" | cut -c1-16) publicado"
