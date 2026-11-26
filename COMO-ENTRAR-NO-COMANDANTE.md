# Como entrar no Comandante (acessar seus agentes)

São **dois endereços**:

| Endereço | Pra quê | Quem entra |
|---|---|---|
| `https://agents.mateus-bueno.dev` | A vitrine: o escritório que qualquer um vê. O "Comandante" que aparece lá é só uma **prévia simulada**. | Qualquer pessoa |
| `https://comandante.mateus-bueno.dev/admin` | O painel de verdade: manda tarefas pros agentes e responde perguntas deles. | Só você, com senha |

O painel de verdade roda na VPS e fala com o OpenBot **apenas por dentro da própria máquina** (`127.0.0.1`). Ele nunca fica exposto direto.

---

## O que acontece quando você entra

1. Você abre `comandante.mateus-bueno.dev/admin` e digita a senha.
2. O servidor confere a senha. Ele nunca guarda a senha em si, só um registro do qual não dá pra descobrir a senha. Estando certa, abre uma **sessão de 8 horas** neste navegador.
3. Com a sessão, você vê a lista dos agentes autorizados, manda tarefas e acompanha as respostas.
4. **Sair** encerra a sessão na hora. Reiniciar o serviço encerra todas.

Proteções que já existem:
- **Tentativas:** 5 por 15 minutos por endereço e 20 por minuto no total.
- **Sessão:** só vale nesse subdomínio e só aceita pedidos vindos do próprio painel.
- **Aprovações perigosas:** continuam sendo decididas **no OpenBot**, nunca pelo painel.

---

## Passo a passo (uma vez)

### 1. Na sua máquina: criar a senha

Na pasta do repositório:

```bash
node scripts/gerar-senha.mjs
```

Ele pede a senha duas vezes, sem mostrar na tela, e exige pelo menos 12 caracteres. No fim, imprime uma linha assim:

```
AGENT_OFFICE_ADMIN_PASSWORD_HASH=scrypt:…:…
```

- **Guarde a senha** num gerenciador de senhas (1Password, Bitwarden, Chaves do iCloud).
- **A linha** é o que vai pro servidor. Ela não revela a senha, mas mesmo assim mande só pelo canal privado com o seu agente, não poste em lugar público.

### 2. No painel do seu domínio: apontar o subdomínio

No provedor do `mateus-bueno.dev`, crie um registro **A** com nome `comandante` apontando pro IP público da VPS (o mesmo do `agents`). A VPS precisa ter as portas **80 e 443** abertas na OCI. O Caddy usa essas portas pra tirar o certificado HTTPS sozinho.

### 3. Pedir pro seu agente configurar a VPS

Cole isto pro agente (ele vai pedir aprovação a cada etapa):

> Configure o Comandante do Agent Office com **login por senha**, seguindo `PLANO-DEPLOY-OCI.md` (seção "Login direto em endereço separado") e os arquivos `server/agent-office-admin.service`, `server/admin.env.example` e `server/commander.caddy.example` do repositório `Buenno0/agents-bueno`.
> 1. Instale `server/server.mjs` e `server/commander.html` em `/opt/agent-office-admin/` (dono root).
> 2. Crie `/etc/agent-office/admin.env` com permissão 0600 contendo:
>    `AGENT_OFFICE_ADMIN_AUTH=password`, `AGENT_OFFICE_ALLOWED_ORIGIN=https://comandante.mateus-bueno.dev`, `AGENT_OFFICE_TRUST_LOCAL_PROXY=1` e a linha `AGENT_OFFICE_ADMIN_PASSWORD_HASH=…` que eu te passar.
> 3. Crie `/etc/agent-office/agent-map.json` (0600) com os pares `slug → ID do agente no OpenBot` **só dos agentes que eu autorizar**, e ative "Local scripts" apenas neles.
> 4. Adicione o site do `commander.caddy.example` ao Caddy, valide e recarregue.
> 5. Ligue `agent-office-admin.service` e confira: `/admin` abre a tela de senha; senha errada dá 401; sem sessão, `/api/admin/state` dá 401.
> 6. Me avise pra eu fazer o primeiro login e mandar uma tarefa inofensiva de teste.

### 4. Entrar

Abra `https://comandante.mateus-bueno.dev/admin`, digite a senha e pronto.

---

## Trocar a senha (ou esqueceu)

Rode `node scripts/gerar-senha.mjs` de novo e peça pro agente trocar a linha `AGENT_OFFICE_ADMIN_PASSWORD_HASH` em `/etc/agent-office/admin.env` e reiniciar `agent-office-admin`. Isso derruba todas as sessões abertas.

---

## Alternativa mais forte: Cloudflare Access (sem senha)

Em vez de senha, o Cloudflare pede seu e-mail, manda um código e só então deixa chegar no painel. Dá pra exigir também a verificação em duas etapas. É grátis até 50 usuários. Exige mover o DNS do `mateus-bueno.dev` pro Cloudflare e rodar o Cloudflare Tunnel na VPS.

O servidor já suporta (`AGENT_OFFICE_ADMIN_AUTH=access`): ele confere a assinatura do Cloudflare, o e-mail autorizado e a validade. O roteiro está em `PLANO-DEPLOY-OCI.md`, seção "Alternativa com Cloudflare Access".

**Qual escolher?** A senha é mais simples de começar e já está pronta. O Access é melhor se o domínio já está ou vai pro Cloudflare: não há senha pra vazar e o login usa o seu e-mail.

---

## Testar localmente antes (opcional)

```bash
node --test scripts/test-security.mjs   # login, sessão e isolamento com dados fictícios
```
