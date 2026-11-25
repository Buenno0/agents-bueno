# Agent Office

Um escritório isométrico, no estilo Habbo, onde os agentes de IA do OpenBot trabalham, cada um na sua sala. Serve de portfólio público (modo Visitante) e de prévia de um painel privado (modo Comandante).

**No ar:** https://agents.mateus-bueno.dev

## O que tem aqui

- **13 agentes em 4 salas** (Recepção, Sala Técnica, Estúdio, Dia a dia). Os agentes andam até o colega pra entregar um pedido, com o caminho marcado no chão.
- **Cenas gravadas e "Pergunte ao escritório":** mostram o fluxo real (pedido → fila → trabalho → resposta) sem chamar IA nenhuma.
- **Por baixo dos panos:** cada passo vira uma linha do tempo, com a chamada real do sistema ao lado.
- **Planta automática:** um grupo novo de agentes ganha uma sala sozinho, numa ala nova do andar.
- **Estado ao vivo** (quando o servidor tem um snapshot recente), **clima e hora reais de São Paulo**, guia de primeira visita e tour de 1 minuto.
- **Motor próprio em SVG**, sem framework.

## Estrutura

```
office-design/      fonte da interface
  assets/data.js      agentes, salas, cenas, guarda-roupa, roteador, tour
  assets/layout.js    planta automática + caminhos
  assets/sprites.js   desenho (paredes, móveis, Olheiros); roda no navegador e no Node
  assets/app.js       cena, câmera, interação, painéis
  build-prototype.mjs gera prototype/index.html (arquivo único)
  export-assets.mjs   exporta os SVGs + assets.html
prototype/index.html  a página publicada (gerada; não editar à mão)
server/               servidor Node sem dependências (vitrine e Comandante)
deploy/               script de instalação na VPS
scripts/              testes
.github/workflows/    CI e deploy
```

## Rodar localmente

```bash
python3 office-design/serve.py 4317           # interface (sem cache) em http://localhost:4317
node office-design/build-prototype.mjs        # gera prototype/index.html
AGENT_OFFICE_PORT=8788 node server/server.mjs # servidor público em http://127.0.0.1:8788
node scripts/test-layout.mjs                  # testa a planta automática
node --test scripts/test-security.mjs         # testa login e isolamento com dados fictícios
```

Precisa de Node 22 ou mais novo.

## Segurança e privacidade

- A rota pública (`/api/public/state`) devolve só uma lista branca de campos por agente: nunca conversas, telefones, tokens ou IPs.
- A página roda com CSP estrita, e só o próprio servidor busca dados externos (clima).
- A configuração de login direto do Comandante usa endereço separado da vitrine, senha com scrypt, sessão revogável e proteção CSRF. O serviço fala com o OpenBot apenas em `127.0.0.1`.
- Ações perigosas continuam pedindo confirmação no próprio OpenBot.

Detalhes em [ARQUITETURA-E-SEGURANCA.md](ARQUITETURA-E-SEGURANCA.md) e [PLANO-DEPLOY-OCI.md](PLANO-DEPLOY-OCI.md).

## Deploy

Push na `main` → o GitHub Actions checa e empacota a vitrine → depois de uma aprovação no ambiente `production`, instala na VPS com `deploy/agent-office-deploy.sh`, que restaura a vitrine se a nova página não subir. O Comandante tem código instalado separadamente. A configuração está em [DEPLOY-VPS.md](DEPLOY-VPS.md).
