# Subir o Agent Office na VPS — instruções para o agente

Data: 2026-11-24 (America/Sao_Paulo)
Pasta do projeto: raiz do repositório `agents-bueno`
Destino: VPS `openbot-ashburn` (OCI, ARM64, Ubuntu 24.04)

> **Regra geral:** nada que mude a VPS é feito sem aprovação via `openbot.ask_ui` com `danger: true`. Faça primeiro tudo que for só leitura (Etapa 1). Depois peça **uma aprovação por etapa** (2, 3, 4 e 5) e mostre o que vai mudar antes de pedir. Se algo sair diferente do esperado, pare e reporte. Não improvise.

---

## O que vai pro ar

Este roteiro cobre a **vitrine pública**. O painel Comandante tem um fluxo de implantação próprio no plano OCI e depende de um endereço protegido pelo Access e de teste com o OpenBot da VPS.

| Arquivo local | Destino na VPS | Observação |
|---|---|---|
| `prototype/index.html` | `/opt/agent-office/prototype/index.html` | Página inteira num arquivo só (HTML, CSS e JS embutidos). Já é gerada pelo build; não editar à mão. |
| `server/server.mjs` | `/opt/agent-office/server/server.mjs` | Ganhou a rota **`GET /api/public/weather`** (clima de São Paulo pelo Open-Meteo, guardado 10 min no servidor). |
| `server/agent-office.service` | `/etc/systemd/system/agent-office.service` | Sem mudanças em relação ao plano. |
| `server/cloudflared-config.yml.example` **ou** `server/Caddyfile.example` | config da borda | **Mudou:** agora libera também `/api/public/weather`. |

Referência da primeira versão publicada:

```
sha256  b068d2a4a183312577bf4cc58ea1df2436e2453e59d1fb8dfccf0377e0c2cdf1  prototype/index.html   (244541 bytes)
sha256  dc8fced0006628018c00f9662570121c68b417d352c8afc2bc5033e281c0f9b7  server/server.mjs
```

Para uma atualização, rode `node office-design/build-prototype.mjs` na pasta do projeto. Calcule os hashes SHA-256 dos arquivos escolhidos e compare com os hashes no destino após a cópia.

---

## Etapa 1 — Conferir (só leitura, sem aprovação)

```bash
uname -m                      # aarch64
node --version                # v22.13 ou mais novo (o server usa fetch nativo)
systemctl status agent-office --no-pager || true
ls -la /opt/agent-office/ /opt/agent-office/prototype/ /opt/agent-office/server/ 2>/dev/null
ss -ltnp | grep -E ':8788|:8789' || true      # nada estranho escutando fora de 127.0.0.1
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' https://api.open-meteo.com/v1/forecast   # saída HTTPS liberada (espera 400, sem parâmetros)
df -h /opt ; free -m
```

Reporte o resultado de cada linha. **Pare** se:
- o Node for mais velho que 22.13;
- a saída pra `api.open-meteo.com` estiver bloqueada (o site funciona sem clima, mas avise);
- a porta 8788 estiver ocupada por outro processo.

---

## Etapa 2 — Backup e cópia dos arquivos (pedir aprovação)

```bash
# backup do que existe hoje (se existir)
sudo mkdir -p /opt/agent-office/backup/$(date +%Y%m%d-%H%M)
sudo cp -a /opt/agent-office/prototype /opt/agent-office/server /opt/agent-office/backup/$(date +%Y%m%d-%H%M)/ 2>/dev/null || true

# estrutura
sudo mkdir -p /opt/agent-office/prototype /opt/agent-office/server /etc/agent-office /var/lib/agent-office
```

Copie os dois arquivos da tabela (scp ou rsync a partir da máquina do dono) para os destinos. Depois:

```bash
sudo chown -R root:root /opt/agent-office
sudo chmod 755 /opt/agent-office /opt/agent-office/prototype /opt/agent-office/server
sudo chmod 644 /opt/agent-office/prototype/index.html /opt/agent-office/server/server.mjs
sha256sum /opt/agent-office/prototype/index.html /opt/agent-office/server/server.mjs   # tem que bater com a tabela
node --check /opt/agent-office/server/server.mjs
```

---

## Etapa 3 — Serviço da vitrine (pedir aprovação)

```bash
sudo cp server/agent-office.service /etc/systemd/system/agent-office.service   # se ainda não existir
sudo touch /etc/agent-office/public.env
# Só com Cloudflare Tunnel na frente:
#   echo 'AGENT_OFFICE_TRUST_CF_IP=1' | sudo tee /etc/agent-office/public.env
sudo systemd-analyze verify /etc/systemd/system/agent-office.service
sudo systemctl daemon-reload
sudo systemctl enable --now agent-office
sudo systemctl restart agent-office      # se já estava rodando, pra carregar o server.mjs novo
```

Teste local (tudo em loopback):

```bash
curl -s -o /dev/null -w '/                    %{http_code}\n' http://127.0.0.1:8788/
curl -s -o /dev/null -w '/healthz             %{http_code}\n' http://127.0.0.1:8788/healthz
curl -s -o /dev/null -w '/api/public/state    %{http_code}\n' http://127.0.0.1:8788/api/public/state
curl -s                                             http://127.0.0.1:8788/api/public/weather; echo
curl -s -o /dev/null -w '/api/admin/session   %{http_code}\n' http://127.0.0.1:8788/api/admin/session
curl -sI http://127.0.0.1:8788/ | grep -i content-security-policy
journalctl -u agent-office -n 20 --no-pager
```

Esperado:

| Rota | Código |
|---|---|
| `/` | 200 |
| `/healthz` | 200 |
| `/api/public/state` | **503** (normal enquanto não existir o snapshot; a página mostra "simulação") |
| `/api/public/weather` | 200, com algo como `{"kind":"cloud","temp":23.8,"isDay":false}` |
| `/api/admin/session` | 404 (o modo público não serve rotas privadas) |
| cabeçalho CSP | presente, com `script-src 'sha256-…'` |

---

## Etapa 4 — Borda HTTPS (pedir aprovação)

**Atenção:** a borda precisa liberar a rota nova. Sem isso, o clima não aparece no ar.

- **Cloudflare Tunnel (recomendado):** a regra pública fica assim (já atualizada no exemplo):
  ```yaml
  - hostname: agents.mateus-bueno.dev
    path: ^/($|index\.html$|api/public/(state|weather)$)
    service: http://127.0.0.1:8788
  ```
  ```bash
  cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
  cloudflared tunnel --config /etc/cloudflared/config.yml ingress rule https://agents.mateus-bueno.dev/api/public/weather
  sudo systemctl restart cloudflared
  ```
  **Não** publique a regra de `/api/admin` neste deploy. Se ela já existir no arquivo, mantenha-a atrás do Access, como está no exemplo.
- **Caddy (alternativa):** `@office_public path / /index.html /api/public/state /api/public/weather` (já atualizado no exemplo). Depois rode `sudo caddy validate --config /etc/caddy/Caddyfile` e `sudo systemctl reload caddy`.

Teste externo:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://agents.mateus-bueno.dev/
curl -s https://agents.mateus-bueno.dev/api/public/weather; echo
curl -s -o /dev/null -w '%{http_code}\n' https://agents.mateus-bueno.dev/healthz          # 404 na borda
curl -s -o /dev/null -w '%{http_code}\n' https://agents.mateus-bueno.dev/api/admin/state  # 404 ou bloqueado pelo Access
```

---

## Etapa 5 — Estado ao vivo (opcional, pedir aprovação)

Sem isto, a página funciona em **simulação**. Para mostrar os status reais, um coletor autorizado escreve `/var/lib/agent-office/public-state.json` **a cada 15 min**, de forma atômica (grava um temporário na mesma pasta e depois usa `mv`):

```json
{"agents":[{"slug":"whatsapp-orchestrator","status":"working","lastActiveRelative":"nas últimas horas"}, …]}
```

- Exatamente os 13 slugs do catálogo, um de cada.
- `status`: `ready` | `working` | `queued` | `waiting`.
- `lastActiveRelative`: `"nas últimas horas"` | `"hoje"` | `"há mais tempo"` | `null`. **Nenhum outro texto.**
- O arquivo precisa ter menos de 30 min e menos de 64 KB. Se não tiver, a rota volta a dar 503 e a página volta pra simulação.
- Permissões: só o coletor escreve, e o serviço (usuário dinâmico) precisa conseguir ler. Ex.: `chmod 644` e a pasta `755`.

A página consulta a rota ao abrir e a cada 60 s. Com dados válidos, mostra **Presença publicada**. A publicação deve ter atraso mínimo de uma janela.

### Grupo novo de agentes

A página cria sozinha uma sala nova quando a API lista um agente que ela não conhece, com `displayName` e `room`. Para isso, o agente precisa estar:
1. no `AGENT_CATALOG` do `server/server.mjs` (é a lista de segurança). Depois, refazer as Etapas 2 e 3;
2. no snapshot do coletor (o servidor exige snapshot e catálogo com o mesmo número de agentes).

---

## Rollback

```bash
sudo systemctl stop agent-office
B=$(ls -d /opt/agent-office/backup/* | tail -1)
sudo cp -a "$B/prototype/." /opt/agent-office/prototype/
sudo cp -a "$B/server/."    /opt/agent-office/server/
sudo systemctl start agent-office
```

Se o problema for na borda, volte o arquivo anterior do `cloudflared`/Caddy e reinicie o serviço. Não apague o histórico e não reinicie o processo principal do OpenBot. A versão antiga da página também fica no projeto em `prototype/index.v2-backup.html`.

---

## Checklist de aceite (reportar ao dono)

- [ ] Hashes da Etapa 2 conferem.
- [ ] `agent-office` ativo, escutando **só** em `127.0.0.1:8788`.
- [ ] `/`, `/healthz` (local) e `/api/public/weather` com 200. `/api/public/state` com 503, ou 200 se a Etapa 5 rodou.
- [ ] Externo: a página abre, `/healthz` dá 404 e `/api/admin/*` não está acessível.
- [ ] No navegador: a pílula mostra "simulação" (ou "ao vivo"), o relógio mostra a hora de SP e o céu acompanha a hora e o clima. O console não mostra bloqueio de CSP.
- [ ] Memória do serviço abaixo de 128 MB (`systemctl show agent-office -p MemoryCurrent`).
- [ ] `journalctl -u agent-office` só com linhas de metadados (rota, código, duração). Sem corpo, IP ou token.

## O que NÃO fazer

- Não subir a pasta `office-design/` (é a fonte de desenvolvimento). Só o `prototype/index.html` gerado vai pro ar.
- Não ligar `agent-office-admin.service` nem abrir `/api/admin` pra fora neste deploy.
- Não colocar telefones, JIDs, tokens, IPs ou caminhos locais em nenhum arquivo publicado.
- Não mudar `AGENT_OFFICE_TRUST_CF_IP` sem o Cloudflare na frente.

---

## Atualização automática (GitHub Actions)

Repositório: `github.com/Buenno0/agents-bueno`. Workflow: `.github/workflows/deploy.yml`.

**Como funciona:** todo push e pull request roda as checagens:
- o build está em dia;
- a planta automática passa no teste;
- o servidor responde certo;
- nenhum dado privado aparece nos arquivos.

Num push na `main`, o job **Publicar na VPS**:
1. espera **aprovação manual** no ambiente `production` (GitHub → Actions → aprovar);
2. envia `index.html`, `server.mjs`, `commander.html` e `SHA256SUMS` para `/tmp/agent-office-release-<sha>/` na VPS;
3. roda `sudo /usr/local/bin/agent-office-deploy <pasta>`. O script confere os hashes, faz backup, instala e reinicia, testa `/healthz` e `/`, **volta sozinho** pra versão anterior se algo falhar e guarda os 5 últimos backups;
4. confere `https://agents.mateus-bueno.dev/` de fora.

### Preparar uma vez (na VPS, com aprovação via `ask_ui`)

```bash
# 1) usuário só pra deploy, sem senha e sem shell interativo além do necessário
sudo adduser --system --group --shell /bin/bash --home /var/lib/agent-office-deploy agent-office-deploy
sudo install -d -m 700 -o agent-office-deploy -g agent-office-deploy /var/lib/agent-office-deploy/.ssh

# 2) chave SSH dedicada (gerada na sua máquina: ssh-keygen -t ed25519 -f agents-deploy -N "")
#    cole a PÚBLICA, restrita a não abrir túneis nem terminal:
echo 'restrict ssh-ed25519 AAAA... agents-bueno-deploy' | sudo tee /var/lib/agent-office-deploy/.ssh/authorized_keys
sudo chown agent-office-deploy: /var/lib/agent-office-deploy/.ssh/authorized_keys && sudo chmod 600 /var/lib/agent-office-deploy/.ssh/authorized_keys

# 3) o script de instalação (do repositório: deploy/agent-office-deploy.sh)
sudo install -m 755 -o root -g root deploy/agent-office-deploy.sh /usr/local/bin/agent-office-deploy

# 4) o ÚNICO sudo permitido a esse usuário
echo 'agent-office-deploy ALL=(root) NOPASSWD: /usr/local/bin/agent-office-deploy /tmp/agent-office-release-*' | sudo tee /etc/sudoers.d/agent-office-deploy
sudo chmod 440 /etc/sudoers.d/agent-office-deploy && sudo visudo -cf /etc/sudoers.d/agent-office-deploy
```

> `restrict` na chave bloqueia encaminhamento de portas, agente e X11. Se o sshd estiver configurado com `AllowUsers`, inclua `agent-office-deploy`.

### Configurar uma vez (no GitHub do repositório)

Em **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `VPS_HOST` | endereço SSH da VPS |
| Secret | `VPS_USER` | `agent-office-deploy` |
| Secret | `VPS_SSH_KEY` | a chave **privada** `agents-deploy` |
| Secret | `VPS_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519 <host>` (confira a impressão digital) |
| Variable | `DEPLOY_ENABLED` | `true` (só depois de tudo pronto; sem ela o deploy fica desligado) |

O ambiente `production` já vem criado exigindo aprovação do dono antes de cada deploy.

### Atualizar o site no dia a dia

```bash
node office-design/build-prototype.mjs   # sempre que mexer em office-design/
git add -A && git commit -m "…" && git push
```

Depois aprove o deploy na aba Actions. Se o CI falhar em "prototype/index.html está em dia", faltou rodar o build.
