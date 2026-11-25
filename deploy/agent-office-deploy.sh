#!/usr/bin/env bash
# Instala somente a vitrine. A unidade privada usa outro diretório.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

src="${1:-}"
if [[ $# != 1 || ${SUDO_USER:-} != agent-office-deploy ||
      ! "$src" =~ ^/tmp/agent-office-release-[0-9a-f]{40}(\.[a-zA-Z0-9]{8})?$ ]]; then
  echo "origem de release inválida" >&2
  exit 2
fi

root=/opt/agent-office
exec 9>/run/lock/agent-office-deploy.lock
flock -n 9
stage=$(mktemp -d "$root/.release.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT

# Leia os arquivos como a conta que enviou o pacote. A cópia de trabalho fica
# sob controle do root antes da validação, da instalação e da reinicialização.
for name in index.html server.mjs SHA256SUMS; do
  runuser -u "$SUDO_USER" -- timeout 10s head -c 2097153 -- "$src/$name" > "$stage/$name"
  [[ $(wc -c < "$stage/$name") -le 2097152 ]]
done
(
  cd "$stage"
  # Compare somente hashes dos nomes esperados, sem interpretar caminhos do manifesto.
  sha256sum index.html server.mjs > expected
  if ! cmp --silent expected SHA256SUMS; then
    # Recebe o pacote do workflow anterior durante a migração.
    head -n 2 SHA256SUMS | cmp --silent expected -
  fi
)

backup=$(mktemp -d "$root/backup/$(date +%Y%m%d-%H%M%S).XXXXXXXX")
cp -p -- "$root/prototype/index.html" "$root/server/server.mjs" "$backup/"
restore() {
  echo "release rejeitada, restaurando a vitrine anterior" >&2
  install -m 644 -- "$backup/index.html" "$root/prototype/index.html"
  install -m 644 -- "$backup/server.mjs" "$root/server/server.mjs"
  systemctl restart agent-office
  exit 1
}

install -m 644 -- "$stage/index.html" "$root/prototype/index.html" || restore
install -m 644 -- "$stage/server.mjs" "$root/server/server.mjs" || restore
systemctl restart agent-office || restore
for _ in $(seq 1 15); do
  if curl -fsS --max-time 2 http://127.0.0.1:8788/healthz >/dev/null &&
     curl -fsS --max-time 3 http://127.0.0.1:8788/ -o "$stage/response" &&
     cmp --silent "$stage/index.html" "$stage/response"; then
    # Preserve older backup layouts and retain the five newest from this installer.
    mapfile -t backups < <(find "$root/backup" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' |
      grep -E '^[0-9]{8}-[0-9]{6}\.[a-zA-Z0-9]{8}$' | sort -r)
    for expired in "${backups[@]:5}"; do rm -rf -- "$root/backup/$expired"; done
    echo "vitrine publicada"
    exit 0
  fi
  sleep 1
done
restore
