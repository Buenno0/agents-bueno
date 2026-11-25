# Direção Visual — Agent Office v3

Escritório isométrico estilo Habbo, desenhado na mesma língua da LP do `viunacidade.com.br`.
Revisão de 2026-11-24.

## O que estava errado na v2

- **Personagem errado.** O Olheiro da LP é uma *caixa* (`rx 14`) com dois olhões âmbar retangulares e um objeto no lugar do chapéu (casinha, torre de relógio). A v2 fez cápsulas com olhinho redondo — parecia mascote genérico.
- **Não era um escritório.** Eram cards num grid com bonecos dentro. Nada de chão, parede, mesa ou caminhada.
- **Ruído de dashboard.** Pílulas, rótulos e "fichas" competindo entre si; texto técnico demais na primeira dobra.
- **Semântica de cor trocada.** "Trabalhando" estava em vermelho (`--danger`).

## O que a LP ensina (medido no DOM em produção)

| | Valor |
|---|---|
| Título | Outfit 300, `letter-spacing` ≈ -0.045em (H1 57px, -2.58px) |
| Corpo | Manrope 400–700 |
| Céu | `#070d2a → #0c1945 → #152a62 → #24407f` |
| Superfícies noturnas | `--surface #111b40`, `--elev #1a2756`, `--line #2e3f7a`, `--muted #a9b3d9` |
| Luz | `--luz #ffd27a` (aceso), `--ok #5bd1b5`, `--warn #ffc35c`, `--danger #ff6b6b`, `--marco #3563d9` |
| Cena isométrica | polígonos flat em 3 tons (topo `#16275e`, esquerda `#0e1a48`, direita `#0a1438`, contorno `#2f4a9a`), janelas acesas em âmbar, rua tracejada âmbar |
| Cores dos Olheiros | `#a597ff`, `#f08f6f`, `#79bcff`, `#5fd3b8`, `#ff7cb8`, bochecha `#ff7a9a` |
| Forma de fala | `border-radius: 14px 14px 14px 4px` |

## A cena

- **Grade 22×15, tile 64×32 (2:1).** Motor próprio em SVG (`assets/app.js`), sem libs.
- **Planta:** Hub Central (recepção com balcão, sofá lilás, elevador do 13º andar, relógio com a hora real de São Paulo e letreiro da marca) · War Room Infra (painel de saúde na parede, racks com LEDs) · corredor com café e a linha âmbar tracejada da LP · Product Lab (lousa com post-its, puffs) · Personal Ops (arquivos de aço).
- **Paredes do fundo** com janelas que mostram a cidade à noite. Divisórias baixas de vidro com portas, para nunca esconder ninguém.
- **Luz:** abajures projetam poças âmbar no chão; monitor de quem está trabalhando acende e ilumina o rosto.
- **Ordem de profundidade** recalculada por quadro (soma x+y), então quem anda passa na frente/atrás dos móveis corretamente.

## Os 13 Olheiros

Anatomia copiada da LP: caixa, faixa de luz no topo, sombra embaixo, bochechas, boca-porta, olhões âmbar com pupila que olha para onde o agente está virado, piscada aleatória. O chapéu diz a função:

Orchestrator balão de chat · Codex terminal `>_` · Cloud Ops nuvem · DevOps radar · Supabase pilha de banco · Suporte capacete · Nexus átomo · Viu o pino do Viu · Pitch boina · Curador livros · SUAP capelo · Agenda calendário com o dia de hoje · Insights lâmpada (acende quando trabalha).

## Estados (cor = significado, nunca decoração)

| Estado | Cor | Na cena |
|---|---|---|
| pronto | `--ok` | na mesa ou dando uma volta / indo ao café |
| trabalhando | `--luz` | sentado, monitor aceso, olhos com brilho, selo de digitação |
| na fila | `--lilas #a597ff` | sentado, selo `···` |
| esperando aprovação | `--danger` | selo `!` pulsando; a ilha do topo conta "esperando você" |

## Interação

- **Cenas gravadas** (3): os agentes *andam* até o colega carregando um cartão âmbar e falam em balões. Pausar, próximo passo, de novo. Tudo determinístico: `window.renderAt(sceneKey, stepIndex)`.
- **Conversa:** log estilo Habbo com tudo que foi dito.
- **Ficha (gaveta branca da LP):** retrato, status, resumo, 4 fatos, e o JSON exato da rota pública. No Curador, a lista de leitura.
- **Comandante (prévia):** você vira um Olheiro branco de coroa que sai do elevador. Clique no chão para andar; enviar tarefa faz você levar em mãos. Aprovações aparecem em cartão âmbar.
- Arrastar para mover a câmera, roda/botões para zoom, ← → troca de agente, Esc fecha.
- `prefers-reduced-motion`: sem caminhada (teletransporte), sem balanço, sem animações CSS.

## Privacidade

A página só usa os 10 campos da lista branca de `/api/public/state`. Nada de telefone, JID, token, IP privado ou caminho local. Tudo é rotulado como simulação.

## Arquivos

```
office-design/
├── index.html
├── DIRECAO-VISUAL.md
└── assets/
    ├── data.js     # planta, agentes, cenas, feed (só dados públicos)
    ├── app.js      # motor isométrico, Olheiros, cenas, UI
    ├── styles.css
    ├── logo-agent-office.svg   # cubo isométrico com janela acesa
    └── favicon.svg
```

Para ver: `python3 -m http.server 4317` dentro de `office-design/` e abrir `http://localhost:4317`.

## Publicação

`office-design/` é a fonte. O `server.mjs` só serve `/` (de `prototype/index.html`) e só libera `<script>` inline por hash na CSP, então:

```
node office-design/build-prototype.mjs
```

gera `prototype/index.html` como arquivo único (CSS em `<style>`, dados e motor em `<script>` sem atributos, logo inline, favicon em `data:`). Rode de novo sempre que mexer em `office-design/`.

## Estado ao vivo

A página chama `GET /api/public/state` ao abrir e a cada 60 s. Se vier um snapshot válido (13 agentes, status e recência dentro da lista branca), os status reais substituem os da simulação e a ilha mostra **ao vivo**. Se a rota falhar (503 sem snapshot, arquivo local, formato inesperado), fica em **simulação**. As cenas gravadas são sempre simulação. `lastActiveRelative` usa só os valores do contrato: `nas últimas horas`, `hoje`, `há mais tempo` ou `null`.

## Assets

Todo desenho mora em `assets/sprites.js` (sem DOM). O app e o exportador usam o mesmo código, então os arquivos nunca divergem da cena.

```
node office-design/export-assets.mjs
```

gera 66 SVGs em `assets/sprites/` (andar inteiro vazio e com os 13, cada Olheiro, cada chapéu, móveis, peças de parede, pisos, marca e lua) mais `assets/sprites/manifest.json` e o catálogo visual `assets.html`. LEDs, cursor e estrelas continuam animados dentro dos SVGs.

## Easter egg: a lua de olho

No modo Visitante a lua do céu tem o olho dos Olheiros: segue o cursor e pisca. Um clique: "Viu?". Três cliques seguidos: estrela cadente, todos os Olheiros olham pra cima, o Viu comenta e a lua entra na conversa. No modo Comandante ela dorme (clicar só dá "zzz…").

## Zoom

Abre mais perto (1,3× do andar inteiro no desktop). Zoom de 0,3× a 5×: botões, roda do mouse, duplo clique (Shift + duplo clique afasta), teclas `+` `-` e `0` (andar inteiro), e pinça no celular. Ao abrir uma ficha a câmera chega a pelo menos 1,7×.

## Revisão: mais limpo, sem jargão

- **Salas com nomes simples:** Recepção, Sala Técnica, Estúdio e Dia a dia. Cada uma tem piso de cor própria e contorno na cor dela; entre elas há muretas sólidas, com batente âmbar e tapetinho em cada porta.
- **Menos coisa na tela:** saíram os nomes pintados no chão, os tapetes, a legenda do rodapé e metade das plantas, puffs e abajures.
- **Sem jargão:** textos de agentes, cenas, ficha e avisos reescritos em português do dia a dia. A ficha não mostra mais o JSON da API; só uma frase dizendo o que é público.
- **Relógio:** ponteiro de segundos, atualizado a cada segundo com a hora de São Paulo.
- **Rota no chão:** quando um agente vai falar com outro (ou você entrega uma tarefa), o caminho aparece pontilhado na cor dele, com o destino marcado. Passeios à toa não mostram rota.

## Guarda-roupa

Na ficha de cada agente, seção **Visual**: cor do corpo, chapéu (14 opções), roupa (cachecol, gravata-borboleta, colete, moletom, crachá, capa, fone) e cor da roupa.

- **Comandante:** experimenta, clica **Vestir** e o agente troca no escritório. Fica salvo neste navegador (`localStorage`). "Visual original" desfaz.
- **Visitante:** pode experimentar e ver a prévia no retrato, mas o botão fica bloqueado e o escritório não muda.

Quando houver backend para isso, o salvamento deve ir para o servidor (rota do Comandante), para que todos os visitantes vejam o visual escolhido.

## Grupos novos viram salas sozinhos

`assets/layout.js` monta a planta antes de desenhar. As 4 salas originais continuam feitas à mão; todo agente sem mesa ganha lugar numa **ala nova à direita** do andar:

- cada ala tem duas salas, uma de cada lado do corredor (o corredor e a linha âmbar se estendem junto);
- a sala nasce com o nome do grupo, cor própria, contorno, muretas, porta para o corredor, janela no fundo, planta no canto e 2 mesas por coluna (a sala alarga conforme o grupo cresce);
- se a ala ficar com um lado sobrando, ele vira "Espaço livre";
- agente novo de uma sala original que já está cheia vai para "<sala> · anexo".

**De onde vem um grupo novo:**
1. **Servidor (automático):** se `/api/public/state` listar um agente que a página não conhece, com `displayName` e `room`, ele aparece na sala do `room` dele. Se o grupo surgir com a página aberta, ela se refaz sozinha na próxima atualização (a cada 60 s), assim que ninguém estiver no meio de uma cena, com uma ficha aberta ou digitando. Para isso o agente precisa estar no catálogo do `server/server.mjs` (é a lista branca de segurança) e no snapshot.
2. **À mão:** em `assets/data.js`, um agente sem `seat` e com um `roomKey` novo; opcionalmente nomeie o grupo em `GROUPS: [{ key, name, accent, proof }]`.

Limites: até 40 agentes extras; nomes e textos vindos da API são validados e sempre exibidos como texto. Teste da planta: todos os cenários (1 grupo, 2 grupos, grupo de 11, anexo) garantem que cada mesa alcança todos os outros agentes. O `assets.html` traz o exemplo `andar-com-grupos-novos.svg`.

## Por baixo dos panos (pra quem avalia o projeto)

Aba ao lado da Conversa, aberta por padrão. Em cima, o fluxo real em 4 caixas: **WhatsApp ou você → OpenBot (fila e regras) → Agentes**, e **Esta página**, que só lê a lista pública. As caixas acendem quando algo passa por elas.

Embaixo, o rastro: cada coisa que acontece vira uma linha com o que foi, em português, e a chamada do sistema de verdade, por exemplo:

- `Orchestrator passou um pedido para DevOps` · `POST /v1/agents/devops-observabilidade/messages → 202 · dlv_b1a108 na fila`
- `DevOps começou a trabalhar` · `entrega dlv_b1a108 → running`
- `Cloud Ops parou e pediu aprovação humana` · `ask_ui · danger: true → nada acontece sem um sim`
- `Leu o estado público: 13 agentes` · `GET /api/public/state → 200 · 84 ms`
- `Planta montada` · `layout.js · 4 salas fixas + 0 automáticas · 13 mesas`

Cada linha diz a origem: **ao vivo** (veio do servidor), **simulado** (cena gravada ou dados de exemplo) ou **neste navegador** (prévia do Comandante, visual salvo). A pílula do topo mostra "ao vivo · há 12 s" ou "simulação".

## Só a sala

Botão **Só a sala** (ou tecla `F`) esconde os painéis e deixa o escritório ocupando a tela; `Esc` ou o mesmo botão volta.

Clicar no nome de uma sala **isola a sala**: o resto do andar some e ela vira uma maquete solta, com o próprio chão, laje, muretas, móveis e o trecho de parede que fica atrás dela. Quem sai da sala (pra levar um pedido, tomar café) some até voltar. Um cartão no topo mostra o nome, quantos agentes e a regra da sala; "Ver o andar todo", `Esc` ou o botão de enquadrar voltam. Cada móvel sabe a que sala pertence (`sprites.js`), então isso funciona também nas salas criadas sozinhas.

## Novidades (rodada 5)

- **Clicar na sala** (em qualquer ponto do chão, no modo Visitante) isola a sala. Clicar fora dela volta pro andar.
- **Rastreio do pedido:** todo pedido que anda pelo escritório ganha um cartão de rastreio (canto inferior esquerdo): criado → chegou na fila → em andamento → resposta pronta (ou parou pra aprovação), com o tempo de cada etapa e a chamada real. Linhas do "Por baixo dos panos" com pedido têm o botão "Rastrear".
- **Pergunte ao escritório:** o visitante escreve um pedido; um roteador por palavras-chave (`ROUTER` em `data.js`, sem IA) mostra pra quem iria e por quê, e o Orchestrator leva o pedido até lá.
- **Clima e hora reais:** o céu acompanha a hora de São Paulo (madrugada, amanhecer, dia, entardecer, noite; de dia a lua vira sol com olho) e o clima real (nuvens, chuva no céu e nas janelas). O servidor busca o clima no Open-Meteo e guarda 10 min em `GET /api/public/weather`; o navegador do visitante nunca fala com terceiros e a CSP continua `connect-src 'self'`. Pra testar: `AO_sky('day', 'rain')` no console; `AO_sky()` volta ao real.
- **Ver em 1 minuto:** tour automático (roteiro em `TOUR`, `data.js`) que passa pelas salas, roda um pedido com rastreio e termina na aba "Por baixo dos panos". Pronto pra gravar. `Esc` sai.
- **Segredos da lua:** depois do easter egg dos 3 cliques, a lua dá a dica. Digitar `viu` faz todo mundo dançar com luz de festa. `↑↑↓↓←→←→BA` liga os **bastidores**: grade de tiles (livres/bloqueados), muretas e portas, mesas e pontos de visita, todos os caminhos e um painel com fps, objetos ordenados e câmera.

Servidor local sem cache: `python3 serve.py 4317` dentro de `office-design/`. O build também carimba `?v=<hash>` nos links do `index.html`.

## Rodada 6: lateral enxuta

- A lateral ficou só com: título, uma linha, "Ver em 1 minuto", as 3 cenas (título + nº de passos) e a caixa "Pergunte ao escritório".
- "Por baixo dos panos" e "Conversa" saíram da lateral: um botão no pé dela abre um **painel flutuante** sobre o mapa (com o fluxo e o rastro). Um ponto âmbar avisa quando há novidade. No rastro, a chamada técnica só aparece na última linha e ao passar o mouse.
- Sala isolada: o nome, o nº de agentes e o botão "‹ Andar todo" ficam **dentro da pílula do topo**, centralizados. Saiu o cartão solto no canto.
- O rastreio de pedido foi pro canto inferior direito, pra não brigar com o painel.

## Rodada 7: redesenho aplicado (canvas "Agent Office — redesenho")

- **Ficha do agente:** cabeçalho fixo (retrato, sala, nome, chip de status) + abas **Sobre · Visual · Tarefas** + corpo que rola + rodapé fixo por aba. Sobre: resumo, 4 fatos em ícones, pedido de aprovação em cartão âmbar. Visual: retrato grande num palco e fileiras horizontais de cor, chapéu, roupa e cor da roupa; rodapé "Original" + "Vestir" (no Visitante, bloqueado com cadeado). Tarefas (só Comandante): pedido, atalhos e últimas entregas; rodapé "Entregar em mãos".
- **Por baixo dos panos:** linha do tempo. Cada passo é um cartão com frase e hora; abrir um passo mostra a chamada real e acende o caminho no mini diagrama WhatsApp → OpenBot → Agentes → Página. O mais recente abre sozinho.
- **Celular:** o hambúrguer abre o menu como folha que sobe de baixo, com os itens entrando em cascata e o mapa escurecido atrás; escolher uma cena fecha a folha.

## Rodada 8: fechamento

- **Resumo de cada sala:** isolar uma sala abre, à direita, um cartão com o que ela faz (`summary` em `data.js`; nas salas criadas sozinhas, o texto é gerado), quantos agentes estão nela e quantos estão trabalhando ou esperando, a regra da sala e a lista de quem está lá (clicável).
- **IA com logo:** o fato "IA" mostra a marca (Gemini, GPT; Claude e Hermes já previstos). Quando a IA ainda não foi definida, aparece um ícone neutro.
- O cartão "Reserva" saiu; ficaram IA, Regra e Visto.
- Deploy: ver `../DEPLOY-VPS.md`. A borda agora libera `/api/public/weather`.
