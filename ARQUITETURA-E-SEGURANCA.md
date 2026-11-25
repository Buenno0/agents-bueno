# Agent Office — arquitetura e segurança

Especificação para implementação · 24/11/2026

O Agent Office tem duas superfícies. A vitrine pública recebe somente um catálogo revisado de 13 agentes e, quando habilitado, um retrato atrasado de presença. O Comandante autenticado envia tarefas, acompanha entregas e responde a perguntas comuns por um adaptador no servidor. O modo **Admin Preview** do protótipo usa dados fictícios e não autoriza operações.

- **Documentado no OpenBot 0.78.0:** a Local Scripts API oferece fila de mensagens, consulta por entrega e leitura/resposta de pendências por agente habilitado. A listagem local fornece identidade e rotinas, sem estado global de presença. O projeto precisa validar uma fonte de presença separada antes de apresentar todos os agentes ao vivo. [Contrato da versão 0.78.0](https://github.com/nightly-labs/openbot/blob/v0.78.0/docs/automation.md)
- **Registrado sobre a instalação:** o brief define o elenco de 13 agentes da vitrine. A matriz interna de 22/11 registra três pools de cota e a configuração de 11 agentes. A configuração atual dos outros dois, o inventário da VPS e a política de fallback efetivamente carregada ainda precisam de conferência.
- **Latência:** o brief relata cerca de 130–550 ms para a coleta acadêmica direta. A matriz interna descreve reaproveitamento de sessão, acesso direto à área do boletim e extração seletiva no navegador. Sem amostras, condições de medição ou percentis disponíveis, a faixa é uma referência histórica e não sustenta um SLA ou uma afirmação sobre o tempo total da tarefa.
- **Proposto:** projeção pública com atraso, API do Comandante, fichas e replays. A validação deste documento é local. A VPS e a instalação do OpenBot ficaram fora do teste.

## 1. Vitrine pública

**GET /api/public/state** · `200 application/json; charset=utf-8` · `Cache-Control: public, max-age=60`. Qualquer método de escrita recebe `405`. A rota não aceita parâmetros. O corpo de sucesso tem uma única chave `agents`, com os 13 agentes na ordem do catálogo, cada slug uma vez. Todos os objetos têm chaves fechadas e campos obrigatórios. A validação rejeita campos extras, valores fora do domínio e combinações inconsistentes.

```ts
type PublicState = { agents: PublicAgent[] };
type PublicAgent = {
  slug: string;
  displayName: string;
  roleTitle: string;
  room: "Hub Central" | "War Room Infra" | "Product Lab" | "Personal Ops";
  status: "ready" | "working" | "queued" | "waiting";
  safeActivityLabel: string | null;
  primaryModelFamily: "Gemini" | "GPT" | "Claude" | "DeepSeek" | null;
  backupPoolsCount: 0 | 1 | 2 | null;
  guardrailBadge: "Fast-Path" | "Aprovação humana" | "Somente leitura" |
    "RLS" | "Workspace" | "Revisão humana" | "Vault" | "Deduplicação";
  lastActiveRelative: "nas últimas horas" | "hoje" | "há mais tempo" | null;
};
```

| Campo | Regra de serialização |
| --- | --- |
| `slug`, `displayName`, `roleTitle`, `room`, `guardrailBadge` | Copiar exclusivamente a linha correspondente do catálogo versionado abaixo. |
| `status` | Projetar somente eventos de operação autorizados para publicação. Precedência `waiting > working > queued > ready`. `waiting` indica pausa por interação humana sem revelar o motivo. `working` representa execução, `queued` representa trabalho aceito que aguarda execução e `ready` exige fonte disponível e confirmação de ociosidade. |
| `safeActivityLabel` | Usar o literal da linha quando `status === "working"`. Usar `null` nos outros três estados. |
| `primaryModelFamily`, `backupPoolsCount` | Copiar a matriz revisada abaixo. Contar pools de contingência distintos do pool primário, mesmo com vários modelos dentro do mesmo pool. `null` indica informação pendente de conferência. A família é a primária configurada, inclusive durante fallback. |
| `lastActiveRelative` | Faixas calculadas sobre a janela publicada. Com base no fim dessa janela, `[0, 4h)` = `nas últimas horas`, `[4h, 24h)` = `hoje` (24h móveis), `≥24h` = `há mais tempo`. Usar `null` quando falta evidência publicada. Nenhum timestamp sai da projeção. |

Exemplo de um item da lista, com estado ilustrativo.

```json
{
  "slug": "devops-observabilidade",
  "displayName": "DevOps — Observabilidade",
  "roleTitle": "Observabilidade de nuvem",
  "room": "War Room Infra",
  "status": "working",
  "safeActivityLabel": "Verificando a saúde dos serviços",
  "primaryModelFamily": "Gemini",
  "backupPoolsCount": 2,
  "guardrailBadge": "Somente leitura",
  "lastActiveRelative": "nas últimas horas"
}
```

Na versão inicial, a vitrine usa o elenco estático e exibe **Simulação**. Habilitar o retrato real depois de validar a fonte e autorizar quais rotinas podem influenciar a publicação. A proposta é publicar em intervalos fixos de 15 minutos, com atraso mínimo de uma janela, sem publicar mudança por evento. A presença e a faixa de recência devem refletir somente atividade autorizada, inclusive para Personal Ops. Essas faixas reduzem a correlação temporal e ainda permitem inferir padrões aproximados de atividade. Até validar essa exposição, manter o elenco em simulação.

O serviço público lê um instantâneo já sanitizado produzido pelo coletor. Ele não possui acesso à credencial do OpenBot nem consulta o runtime para responder a visitantes. Quando o instantâneo validado estiver ausente, corrompido ou ultrapassar duas janelas desde a última publicação, devolver `503 {"error":{"code":"state_unavailable"}}` com `Cache-Control: no-store`. A UI passa para o catálogo estático, rotulado **Simulação**, sem reaproveitar o último status como atual. Método inválido devolve `405 {"error":{"code":"method_not_allowed"}}` com `Allow: GET`. Parâmetros devolvem `400 {"error":{"code":"invalid_request"}}`. Ambos usam `Cache-Control: no-store` e omitem a entrada.

A projeção monta cada objeto do zero. O coletor recebe apenas o sinal de presença necessário, rejeita estados desconhecidos, ignora remetentes, IDs operacionais e texto de conversas e valida a saída contra a lista branca por chave e por valor. A vitrine e seus assets não incluem dados pessoais, nomes de grupos privados, identificadores de mensageria, credenciais, IPs privados, caminhos locais, prompts, mensagens ou respostas operacionais. HTML, bundles, source maps, logs e eventos de analytics entram no mesmo teste de exposição. [OWASP API3: autorização de propriedades e validação de respostas](https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization/)

## 2. Comandante autenticado

O navegador chama somente a API do próprio Comandante. O adaptador resolve `:id` como **slug do catálogo** e mapeia internamente para os agentes autorizados que têm Local scripts habilitado. `:deliveryId` e `:pendingId` são referências opacas criadas pelo Agent Office, vinculadas à identidade autenticada e ao agente, com mapeamento privado para IDs do OpenBot. A autorização é verificada a cada consulta, inclusive após obter um recibo. [OWASP API1: autorização por objeto](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)

A borda privada usa Access com MFA no provedor de identidade, ou sessão assinada emitida após autenticação forte. Com Access, validar assinatura, emissor, audiência, validade e identidade autorizada na origem. Com sessão própria, usar cookie `Secure`, `HttpOnly`, `SameSite=Strict` e expiração curta. Validar `Origin` exata e token CSRF vinculado à sessão nos POSTs. A UI obtém esse token no documento privado autenticado. Sem CORS entre origens, cache compartilhado ou service worker no console. Todas as respostas privadas usam `Cache-Control: private, no-store`. [Cloudflare: validação na origem](https://developers.cloudflare.com/reference-architecture/design-guides/identity-gated-edge/)

| Rota do Agent Office | Corpo e resposta de sucesso | Chamada interna |
| --- | --- | --- |
| `POST /api/admin/agents/:id/messages` | Entrada `{ "text": "Prepare um resumo técnico.", "clientMessageId": "1b19a089-1b80-42ff-95db-4a21f3ec4676" }`. Saída `202 { "deliveryId": "dlv_exemplo", "status": "queued", "position": 1 }`. `status` segue o domínio abaixo, `position` é inteiro positivo ou `null`. | `POST /v1/agents/:agentId/messages`. Projetar somente a entrega do destinatário autorizado, identificada pelo retorno do OpenBot. |
| `GET /api/admin/agents/:id/deliveries/:deliveryId` | `200 { "deliveryId": "dlv_exemplo", "status": "completed", "answer": "Resumo pronto.", "error": null }`. `answer` é texto ou `null`. `error` é um código fixo ou `null`, sem erro bruto do provedor. | `GET /v1/agents/:agentId/deliveries/:deliveryId`. Usar ID interno recuperado do vínculo. |
| `GET /api/admin/agents/:id/pending` | `200 { "items": [...] }`, com lista vazia quando nada estiver pendente. Cada item segue a união definida abaixo. | `GET /v1/agents/:agentId/pending`. Projetar apenas os campos necessários ao console. |
| `POST /api/admin/agents/:id/pending/:pendingId/answer` | Entrada `{ "answers": { "format": ["Resumo"] } }`. Saída `200 { "ok": true }` após aceite pelo runtime. Esta rota cobre a resposta a perguntas comuns. | Revalidar pendência, tipo e vínculo. Encaminhar o formato de resposta ao `POST /v1/agents/:agentId/prompts/:requestId/answer`. |
| `GET /api/admin/state` | `200 { "agents": [...] }`. Cada item tem apenas `{ "slug": string, "status": "ready" \| "working" \| "queued" \| "waiting" \| null }`. `null` significa presença desconhecida. | Projeção de presença sem atraso quando uma fonte suportada for validada. Até lá, devolver `null` quando não houver evidência suficiente. |

```ts
type DeliveryStatus =
  "queued" | "starting" | "running" | "completed" |
  "failed" | "interrupted" | "cancelled";

type PendingItem =
  | {
      pendingId: string;
      kind: "question";
      requiresOpenBot: false;
      questions: {
        id: string;
        header: string | null;
        question: string;
        options: { label: string; description: string | null }[] | null;
      }[];
    }
  | {
      pendingId: string;
      kind: "question" | "approval" | "browser_takeover";
      requiresOpenBot: true;
      questions: [];
    };
```

O recebimento `202` informa aceite na fila. A UI consulta a entrega a cada 2 s enquanto visível, com recuo em caso de falha e parada em estado terminal. Consultar pendências ao abrir ou atualizar a gaveta privada. Uma entrega em execução pode estar aguardando uma pessoa. A consulta de pendências e a presença operacional são sinais distintos. Em uma entrega terminal, mostrar eventual `answer` como texto simples com a ocultação de segredos no servidor. Mapear `error` para `delivery_failed`, `delivery_interrupted` ou `delivery_cancelled` conforme o estado terminal correspondente.

Os POSTs aceitam somente JSON de até 16 KiB. `text` contém 1–4.000 caracteres após aparar espaços. `clientMessageId` é um UUID gerado para cada novo envio. Uma repetição usa a mesma chave e o mesmo texto dentro da janela de 24 h documentada no OpenBot. Registrar localmente a combinação identidade/agente/chave, hash do corpo e recibo, com unicidade e escrita consistente. Derivar a chave encaminhada ao OpenBot dessa combinação para preservar a deduplicação se o adaptador cair entre o envio e o recebimento. Chave reutilizada com outro corpo recebe `409`. Após timeout, a UI conserva a chave, consulta o recibo se já disponível e só repete o envio com a mesma chave dentro da janela. Após a janela, indica resultado indeterminado para conferência no OpenBot.

Em perguntas comuns, o adaptador reconsulta a pendência, exige os IDs das perguntas atuais e valida os rótulos das opções. Texto livre usa um único valor de até 1.000 caracteres somente quando o tipo estiver claro. Escolhas múltiplas ou formatos ambíguos, campos secretos, aprovações e tomada de controle do navegador são encaminhados à interface nativa. Enviar a resposta a uma pergunta jamais equivale a autorizar uma ação de deploy. O protótipo pode simular tanto a aprovação quanto a recusa. Em operação, o cartão `ask_ui` com `danger: true` permanece no OpenBot, onde proprietário ou administrador vê ação, escopo e impacto e toma a decisão. A Local Scripts API rejeita por `403` o aceite reservado a esses perfis. O adaptador não oferece rota de aprovação nem tenta reconstruir cartões nativos que a API não liste. [Contrato de pendências e restrições do OpenBot 0.78.0](https://github.com/nightly-labs/openbot/blob/v0.78.0/docs/automation.md#routes)

Erros do adaptador seguem `{"error":{"code":"..."}}`. Códigos fixos por HTTP: `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 not_found` para agente ou referência fora do escopo, `405 method_not_allowed`, `409 conflict` para chave conflitante ou pendência encerrada, `413 payload_too_large`, `415 unsupported_media_type`, `429 rate_limited` com `Retry-After`, `502 upstream_invalid` para resposta incompatível e `503 upstream_unavailable` para falha temporária. Campos adicionais são rejeitados. O proxy de borda pode apresentar login antes que o pedido alcance o adaptador.

O adaptador usa o endereço e a credencial de automação somente no servidor, com leitura atualizada a cada chamada e respeito às permissões de arquivo do OpenBot. O token tem autoridade nos agentes com Local scripts habilitado. Manter o adaptador privado e habilitar Local scripts só para o conjunto autorizado. Executar o leitor público com identidade sem acesso a esses arquivos. Aceita como destino apenas HTTP para `127.0.0.1` com porta válida e sem credenciais embutidas, redirecionamento ou caminho na URL base. Ele monta caminhos e cabeçalhos locais a partir das rotas fixas, sem repassar `Origin`, cookies ou headers arbitrários do navegador. Não expõe rotas de alteração de modelo, configuração, rotinas ou limpeza de contexto. Limitar mensagens por operador e agente. Registrar contagens, duração, classes de erro e decisões de autorização sem gravar conteúdo, respostas, cabeçalhos, caminhos locais ou credenciais.

## 3. Catálogo e fichas da gaveta

O texto da ficha é estático e acompanha os assets públicos. O título, o rótulo e o selo são os literais do contrato. A interface pode usar o resumo global **Três pools de cota** para explicar contingência entre Google Antigravity, OpenAI Codex e Nous Hermes. A contagem da ficha representa pools alternativos distintos. Mostrar **Configuração a confirmar** para família ou contagem nulas. Cada ficha destaca o mecanismo do agente e seu efeito operacional.

| slug | displayName | roleTitle | room | safeActivityLabel | primaryModelFamily | backupPoolsCount | guardrailBadge | Ficha pública |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| whatsapp-orchestrator | WhatsApp Orchestrator | Triagem e roteamento | Hub Central | Classificando uma solicitação | Gemini | 2 | Fast-Path | Encaminha solicitações a especialistas e evita duplicar a resposta no canal de entrada com despacho silencioso. |
| assistente-codex | Assistente Codex | Coordenação e engenharia local | War Room Infra | Coordenando uma tarefa técnica | GPT | 2 | Aprovação humana | Distribui trabalho conforme as permissões de cada especialista e acompanha a entrega pela fila. |
| cloud-ops | Cloud Ops — Deploy & VPS | Operação de infraestrutura | War Room Infra | Preparando uma operação de infraestrutura | null | null | Aprovação humana | Planeja operações em ARM64 e delimita alvo e impacto antes de pedir autorização para uma mudança. |
| devops-observabilidade | DevOps — Observabilidade | Observabilidade de nuvem | War Room Infra | Verificando a saúde dos serviços | Gemini | 2 | Somente leitura | Consolida sinais de saúde de múltiplos provedores com verificações de leitura e relatório rastreável. |
| supabase-db | Supabase & DB — Dados & RLS | Segurança e desempenho de dados | War Room Infra | Revisando políticas de acesso | null | null | RLS | Revisa políticas que limitam o acesso por linha no Postgres e avalia índices a partir de evidências. |
| suporte-saude-bugs | Suporte — Saúde e Bugs | Diagnóstico operacional | War Room Infra | Analisando filas e rotinas | Gemini | 2 | Somente leitura | Cruza sinais de fila, cota e rotinas para localizar a origem de falhas com diagnóstico de leitura. |
| nexus-pesquisa | Nexus — Pesquisa Técnica | Pesquisa de sistemas distribuídos | Product Lab | Revisando evidências de arquitetura | GPT | 2 | Workspace | Relaciona decisões de arquitetura a testes e propõe experimentos reproduzíveis sobre entrega e idempotência. |
| viu-mercado-adocao | Viu — Mercado e Adoção | Estratégia e adoção de produto | Product Lab | Avaliando hipóteses de adoção | GPT | 2 | Workspace | Converte hipóteses de produto em critérios verificáveis para pilotos e decisões de adoção. |
| pitch-design | Pitch — Design & Slides | Comunicação de engenharia | Product Lab | Estruturando uma apresentação | Gemini | 2 | Revisão humana | Traduz decisões técnicas e resultados em apresentações com evidência associada a cada afirmação. |
| curador-threads-links | Curador — Threads & Links | Curadoria técnica | Product Lab | Conferindo referências técnicas | Gemini | 2 | Revisão humana | Triagem e síntese de referências com links rastreáveis para revisão editorial. |
| faculdade-suap | Faculdade — SUAP | Coleta acadêmica seletiva | Personal Ops | Executando uma consulta acadêmica | Gemini | 2 | Vault | Reaproveita sessão autorizada e lê a área necessária para reduzir trabalho no navegador. Faixa histórica reportada para a coleta direta: ~130–550 ms. |
| agenda-semana | Agenda — Semana | Sincronização de agenda | Personal Ops | Consolidando uma janela de agenda | Gemini | 2 | Somente leitura | Faz leitura estruturada e consolida janelas semanais em rotinas escalonadas, com deduplicação do resumo. |
| insights-diario | Insights — Diário | Indexação e deduplicação | Personal Ops | Indexando registros | Gemini | 2 | Deduplicação | Usa um índice estruturado e deduplicação em SQLite para recuperar registros em rodadas posteriores. |

Os selos de função resumem a prática editorial. **Revisão humana** indica revisão prevista do material e não representa uma trava técnica. O selo **Aprovação humana** indica uma política de operação para mudanças e não concede permissões.

## 4. Replays de orquestração

Cada replay usa uma sequência constante embutida no protótipo. O relógio em milissegundos indica tempo de animação desde **Simular fluxo**. A sequência se inicia com participantes em `ready`. Em `working`, cada personagem vai à bancada e mostra o rótulo do catálogo. Em `queued` e `waiting`, a UI mostra o estado e a legenda fixa do passo. As setas acendem no intervalo do passo que as ativa. O fim, cancelamento ou início de outra cena limpa animações e restaura o mapa. Oferecer pausa e avanço por etapa, com a mesma ordem no modo de movimento reduzido. A simulação usa entradas fictícias, funciona offline e faz zero requisições ao reproduzir, inclusive no Admin Preview.

### A. Triagem WhatsApp → Checkup Cloud Somente-Leitura · `whatsapp-checkup`

| Tempo | Mapa | Legenda |
| --- | --- | --- |
| 0 ms | WhatsApp Orchestrator `working` no Hub Central. | Uma solicitação fictícia de saúde da nuvem chega à triagem. |
| 700 ms | Acender Hub Central → War Room Infra. DevOps `queued`, Orchestrator `ready`. | O roteador entrega a tarefa ao especialista com despacho silencioso. |
| 1.400 ms | DevOps `working` na bancada. | O especialista lê sinais de disponibilidade e latência com acesso de leitura. |
| 2.700 ms | DevOps `ready`, acender a conexão de retorno para o Hub. | Resultado de exemplo entregue: disponibilidade normal e latência dentro do limite da cena. |
| 3.600 ms | Concluir e restaurar. | O mesmo pedido percorre triagem, fila e verificação, sem alterar serviços. |

### B. Coleta Acadêmica Fast-Path · `coleta-fast-path`

| Tempo | Mapa | Legenda |
| --- | --- | --- |
| 0 ms | WhatsApp Orchestrator `working`. | Uma solicitação acadêmica de exemplo chega à triagem. |
| 600 ms | Acender Hub Central → Personal Ops. Faculdade `queued`, Orchestrator `ready`. | A rota rápida encaminha a consulta à integração acadêmica. |
| 1.200 ms | Faculdade `working` na bancada, destacar o selo Vault. | A coleta reutiliza uma sessão autorizada e lê a área necessária. |
| 2.300 ms | Faculdade `ready`, acender retorno ao Hub. Mostrar `≈130 ms` ao lado da legenda. | Exemplo ilustrativo da extremidade inferior da faixa histórica reportada para a coleta direta. O tempo da animação e a duração total da tarefa são independentes. |
| 3.200 ms | Concluir e restaurar. | O resumo fictício mostra apenas que a consulta terminou. Nenhum dado acadêmico é exibido. |

### C. Auditoria RLS e aprovação de deploy · `rls-aprovacao`

| Tempo | Mapa | Legenda |
| --- | --- | --- |
| 0 ms | Acender Hub Central → War Room Infra. Assistente Codex `working`, Supabase & DB `queued`. | Uma revisão fictícia verifica o isolamento de duas organizações de teste. |
| 750 ms | Codex `ready`, Supabase & DB `working`. | A sessão A lê a própria linha. A leitura da linha de B retorna zero linhas sob o papel da aplicação. |
| 1.650 ms | Acender a conexão interna Supabase & DB → Cloud Ops. Supabase & DB `ready`, Cloud Ops `queued`. | A revisão registra o resultado sintético e encaminha um plano de deploy para homologação de exemplo. |
| 2.300 ms | Cloud Ops `working`, então `waiting` a 2.800 ms. | O plano descreve alvo, ação e impacto. A trava `ask_ui` com `danger: true` aguarda decisão humana. |
| 4.000 ms | Destacar o cartão simulado **Recusado**, Cloud Ops `ready`. | A operadora fictícia recusa a autorização. A mudança fica bloqueada. |
| 4.800 ms | Concluir e restaurar. | O teste de RLS e a autorização de deploy são controles independentes. |

O exemplo de RLS usa um papel sujeito às políticas porque funções ou credenciais privilegiadas podem contorná-las. Ele demonstra a leitura entre organizações em um caso. Uma auditoria real também verificaria permissões e políticas nos caminhos de escrita e demais superfícies expostas. [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 5. Validação local antes de publicar

**Experimento proposto, ainda não executado.** A hipótese é que pedidos públicos e replays não alcançam o plano operacional, mesmo com entradas privadas contendo campos inesperados. Baseline: um objeto bruto de estado e uma entrega fictícia com valores sentinela distintos em cada campo privado. Dataset: os 13 agentes do catálogo, quatro estados, um estado desconhecido, um cenário de instantâneo vencido, um usuário sem sessão e duas identidades privadas de teste. Nenhum dado real é necessário.

Com um OpenBot falso e relógio controlado, gerar o instantâneo, consultar a rota pública e capturar corpo, headers e logs do adaptador. Acessar as rotas privadas sem sessão e repetir com referência vinculada a outro operador ou agente. Confirmar que uma pergunta comum retoma o fluxo e que pendências secretas e de aprovação ficam no OpenBot. Repetir um envio com a mesma chave e simular timeout entre aceite e recibo. Reproduzir cada cena duas vezes offline e comparar estados, legendas e requisições. Aceite: zero sentinelas vazadas, zero chamadas ao plano operacional pelo público, zero requisições por replay, mesmas transições nas duas execuções, `503` para instantâneo inválido ou vencido, `401` sem sessão no adaptador, `404` para vínculo incorreto e uma única entrega por chave. Estimativa: duas horas após disponibilizar o backend de teste. O teste cobre o contrato local. Borda, credenciais e integração com a VPS exigem verificação própria antes de ativar o modo real.
