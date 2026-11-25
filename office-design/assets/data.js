/* Agent Office — dados públicos (lista branca do contrato /api/public/state)
 * Nada aqui é privado: sem telefones, JIDs, tokens, IPs ou caminhos locais.
 */
window.AO_DATA = (function () {
  'use strict';

  // Planta do andar (grade isométrica). x cresce para baixo-direita, y para baixo-esquerda.
  const FLOOR = { w: 22, h: 15 };

  const ROOMS = [
    { key: 'hub',   name: 'Recepção',     x0: 0,  y0: 0, x1: 6,  y1: 5,  floor: ['#2b3272', '#2e3678'], accent: '#ffd27a', proof: 'Onde os pedidos chegam', summary: 'É a porta de entrada. Todo pedido do WhatsApp passa aqui primeiro: o Orchestrator entende do que se trata e chama quem resolve.' },
    { key: 'infra', name: 'Sala Técnica', x0: 7,  y0: 0, x1: 21, y1: 5,  floor: ['#13295f', '#152d66'], accent: '#79bcff', proof: 'Aqui só se observa. Mudar algo pede aprovação.', summary: 'Cuida da parte técnica: servidor, sites, banco de dados e problemas. Os agentes observam e diagnosticam; mudar algo de verdade sempre espera um sim.' },
    { key: 'hall',  name: 'Corredor',     x0: 0,  y0: 6, x1: 21, y1: 7,  floor: ['#0c1641', '#0c1641'], accent: null, proof: '' },
    { key: 'lab',   name: 'Estúdio',      x0: 0,  y0: 8, x1: 10, y1: 14, floor: ['#28296b', '#2b2d72'], accent: '#a597ff', proof: 'Cada projeto no seu canto', summary: 'Onde nascem as ideias: pesquisa, o produto Viu na Cidade, apresentações e leituras. Cada projeto trabalha no seu canto e alguém revisa antes de sair.' },
    { key: 'ops',   name: 'Dia a dia',    x0: 11, y0: 8, x1: 21, y1: 14, floor: ['#12375c', '#143c63'], accent: '#5fd3b8', proof: 'Coisas pessoais, guardadas com cuidado', summary: 'As rotinas do dia a dia: notas da faculdade, agenda da semana e o diário. As senhas ficam num cofre e nada é feito duas vezes.' }
  ];

  // Muretas entre as salas. axis 'x' = linha x=at (corre ao longo de y); 'y' = linha y=at.
  const PARTITIONS = [
    { axis: 'x', at: 7,  from: 0, to: 6,  doors: [2, 3] },
    { axis: 'y', at: 6,  from: 0, to: 22, doors: [3, 4, 13, 14] },
    { axis: 'y', at: 8,  from: 0, to: 22, doors: [5, 6, 16, 17] },
    { axis: 'x', at: 11, from: 8, to: 15, doors: [11, 12] }
  ];

  const AGENTS = [
    {
      slug: 'whatsapp-orchestrator', displayName: 'Orchestrator — Atendimento', shortName: 'Orchestrator',
      roleTitle: 'Atende o WhatsApp e encaminha', room: 'Recepção', roomKey: 'hub',
      publicSummary: 'Recebe as mensagens do WhatsApp, entende o pedido e passa pra quem sabe resolver. Nunca responde duas vezes a mesma coisa.',
      status: 'working', workingLabel: 'Lendo um pedido',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Responde rápido', lastActiveRelative: 'nas últimas horas',
      look: { body: '#5fd3b8', hat: 'bubble', hatColor: '#f3f5ff', outfit: 'badge', outfitColor: '#0a1230' },
      seat: [4, 1], desk: { x: 3, y: 2, w: 2.6, d: 0.8, h: 30, kind: 'counter' }, visit: [4, 3], facing: -1,
      quickPrompts: ['O que chegou hoje?', 'Quem está ocupado?']
    },
    {
      slug: 'assistente-codex', displayName: 'Codex — Coordenação', shortName: 'Codex',
      roleTitle: 'Divide e acompanha o trabalho técnico', room: 'Sala Técnica', roomKey: 'infra',
      publicSummary: 'Divide o trabalho técnico entre a equipe, respeitando o que cada um pode fazer, e acompanha até ficar pronto.',
      status: 'ready', workingLabel: 'Dividindo uma tarefa',
      primaryModelFamily: 'GPT', backupPoolsCount: 2, guardrailBadge: 'Pede sua aprovação', lastActiveRelative: 'nas últimas horas',
      look: { body: '#4b8fd8', hat: 'terminal', hatColor: '#0a1230', outfit: 'hoodie', outfitColor: '#0a1230' },
      seat: [9, 1], visit: [8, 1], facing: 1,
      quickPrompts: ['Quais tarefas estão abertas?', 'O que ficou pendente?']
    },
    {
      slug: 'cloud-ops', displayName: 'Cloud Ops — Servidor', shortName: 'Cloud Ops',
      roleTitle: 'Cuida do servidor', room: 'Sala Técnica', roomKey: 'infra',
      publicSummary: 'Cuida do computador na nuvem onde tudo roda. Antes de mudar qualquer coisa, explica o que vai fazer e espera um sim.',
      status: 'waiting', workingLabel: 'Preparando uma mudança',
      primaryModelFamily: null, backupPoolsCount: null, guardrailBadge: 'Pede sua aprovação', lastActiveRelative: 'nas últimas horas',
      look: { body: '#8cc6ff', hat: 'cloud', hatColor: '#f3f5ff', outfit: 'vest', outfitColor: '#ffd27a' },
      seat: [12, 1], visit: [11, 1], facing: 1,
      quickPrompts: ['O servidor está com folga?', 'Testar a mudança sem aplicar'],
      pendingApproval: { title: 'Publicar a nova versão do painel', detail: 'Isso muda o servidor de verdade. Aqui é só uma prévia: nada acontece.' }
    },
    {
      slug: 'devops-observabilidade', displayName: 'DevOps — Monitoramento', shortName: 'DevOps',
      roleTitle: 'Vigia se tudo está no ar', room: 'Sala Técnica', roomKey: 'infra',
      publicSummary: 'Confere se os sites e serviços estão no ar e avisa quando algo sai do normal. Só olha, nunca mexe.',
      status: 'working', workingLabel: 'Vendo se tudo está no ar',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Só olha, não mexe', lastActiveRelative: 'nas últimas horas',
      look: { body: '#f08f6f', hat: 'radar', hatColor: '#f3f5ff', outfit: 'headphones', outfitColor: '#0a1230' },
      seat: [15, 1], visit: [14, 1], facing: 1,
      quickPrompts: ['Está tudo no ar?', 'Checar o viunacidade.com.br']
    },
    {
      slug: 'supabase-db', displayName: 'Supabase — Dados', shortName: 'Supabase',
      roleTitle: 'Cuida do banco de dados', room: 'Sala Técnica', roomKey: 'infra',
      publicSummary: 'Cuida de onde as informações ficam guardadas: confere se cada pessoa só vê o que é dela e se nada está lento.',
      status: 'ready', workingLabel: 'Conferindo acessos',
      primaryModelFamily: null, backupPoolsCount: null, guardrailBadge: 'Cada um vê só o que é seu', lastActiveRelative: 'hoje',
      look: { body: '#38b896', hat: 'db', hatColor: '#23896f', outfit: 'bowtie', outfitColor: '#0a1230' },
      seat: [10, 4], visit: [9, 4], facing: 1,
      quickPrompts: ['Quem pode ver o quê?', 'Algo está lento?']
    },
    {
      slug: 'suporte-saude-bugs', displayName: 'Suporte — Problemas', shortName: 'Suporte',
      roleTitle: 'Descobre onde as coisas quebram', room: 'Sala Técnica', roomKey: 'infra',
      publicSummary: 'Quando algo falha, procura onde o problema começou. Investiga sem mexer em nada.',
      status: 'queued', workingLabel: 'Procurando um problema',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Só olha, não mexe', lastActiveRelative: 'nas últimas horas',
      look: { body: '#9fadd8', hat: 'hardhat', hatColor: '#ffd27a', outfit: 'vest', outfitColor: '#ff6b6b' },
      seat: [15, 4], visit: [14, 4], facing: 1,
      quickPrompts: ['Algo travou?', 'Ainda temos fôlego hoje?']
    },
    {
      slug: 'nexus-pesquisa', displayName: 'Nexus — Pesquisa', shortName: 'Nexus',
      roleTitle: 'Pesquisa e testa ideias', room: 'Estúdio', roomKey: 'lab',
      publicSummary: 'Estuda como o sistema deveria funcionar e propõe testes pra provar que funciona mesmo.',
      status: 'working', workingLabel: 'Pesquisando',
      primaryModelFamily: 'GPT', backupPoolsCount: 2, guardrailBadge: 'Trabalha no próprio canto', lastActiveRelative: 'nas últimas horas',
      look: { body: '#7465d6', hat: 'atom', hatColor: '#ffd27a', outfit: 'scarf', outfitColor: '#ffd27a' },
      seat: [2, 9], visit: [1, 9], facing: -1,
      quickPrompts: ['Resumo da pesquisa', 'O que falta testar?']
    },
    {
      slug: 'viu-mercado-adocao', displayName: 'Viu — Produto', shortName: 'Viu',
      roleTitle: 'Acompanha o Viu na Cidade', room: 'Estúdio', roomKey: 'lab',
      publicSummary: 'Acompanha o Viu na Cidade: transforma ideias em metas que dá pra medir no piloto, antes de decidir no achismo.',
      status: 'ready', workingLabel: 'Analisando o piloto',
      primaryModelFamily: 'GPT', backupPoolsCount: 2, guardrailBadge: 'Trabalha no próprio canto', lastActiveRelative: 'hoje',
      look: { body: '#a597ff', hat: 'pin', hatColor: '#ffd27a', outfit: 'scarf', outfitColor: '#5fd3b8' },
      seat: [6, 9], visit: [5, 9], facing: -1,
      quickPrompts: ['Como vai o piloto?', 'Números da semana']
    },
    {
      slug: 'pitch-design', displayName: 'Pitch — Apresentações', shortName: 'Pitch',
      roleTitle: 'Monta apresentações', room: 'Estúdio', roomKey: 'lab',
      publicSummary: 'Transforma o trabalho técnico em apresentações claras, com a prova de cada número no slide.',
      status: 'working', workingLabel: 'Montando uma apresentação',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Alguém revisa antes', lastActiveRelative: 'nas últimas horas',
      look: { body: '#ff7cb8', hat: 'beret', hatColor: '#0a1230', outfit: 'bowtie', outfitColor: '#f3f5ff' },
      seat: [2, 12], visit: [1, 12], facing: -1,
      quickPrompts: ['Revisar a apresentação', 'Montar slides do resumo']
    },
    {
      slug: 'curador-threads-links', displayName: 'Curador — Leituras', shortName: 'Curador',
      roleTitle: 'Separa o que vale ler', room: 'Estúdio', roomKey: 'lab',
      publicSummary: 'Lê threads e artigos, separa o que presta e entrega um resumo com o link de cada coisa.',
      status: 'ready', workingLabel: 'Lendo artigos',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Alguém revisa antes', lastActiveRelative: 'hoje',
      look: { body: '#d8a57a', hat: 'books', hatColor: '#5674c8', outfit: 'cape', outfitColor: '#3563d9' },
      seat: [6, 12], visit: [5, 12], facing: -1,
      quickPrompts: ['Resumir uma thread', 'O que vale ler hoje?']
    },
    {
      slug: 'faculdade-suap', displayName: 'SUAP — Faculdade', shortName: 'SUAP',
      roleTitle: 'Busca notas e prazos', room: 'Dia a dia', roomKey: 'ops',
      publicSummary: 'Entra no portal da faculdade e pega só o que importa: notas e prazos. Rápido, sem abrir tudo.',
      status: 'ready', workingLabel: 'Buscando notas',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Senhas no cofre', lastActiveRelative: 'hoje',
      look: { body: '#f6b73c', hat: 'grad', hatColor: '#0a1230', outfit: 'none', outfitColor: '#0a1230' },
      seat: [13, 9], visit: [12, 9], facing: -1,
      quickPrompts: ['Minhas notas', 'Prazos da semana']
    },
    {
      slug: 'agenda-semana', displayName: 'Agenda — Semana', shortName: 'Agenda',
      roleTitle: 'Organiza a semana', room: 'Dia a dia', roomKey: 'ops',
      publicSummary: 'Organiza a semana em blocos e manda um resumo só, sem repetir.',
      status: 'ready', workingLabel: 'Organizando a semana',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Só olha, não mexe', lastActiveRelative: 'hoje',
      look: { body: '#eef2fb', hat: 'calendar', hatColor: '#f08f6f', outfit: 'badge', outfitColor: '#f08f6f' },
      seat: [17, 9], visit: [16, 9], facing: -1,
      quickPrompts: ['Como está minha semana?', 'Organizar a agenda']
    },
    {
      slug: 'insights-diario', displayName: 'Insights — Diário', shortName: 'Insights',
      roleTitle: 'Guarda o diário organizado', room: 'Dia a dia', roomKey: 'ops',
      publicSummary: 'Guarda o diário organizado pra achar qualquer coisa depois, sem duplicar nada.',
      status: 'ready', workingLabel: 'Organizando o diário',
      primaryModelFamily: 'Gemini', backupPoolsCount: 2, guardrailBadge: 'Não repete trabalho', lastActiveRelative: 'hoje',
      look: { body: '#ffb38a', hat: 'bulb', hatColor: '#fff3c9', outfit: 'none', outfitColor: '#0a1230' },
      seat: [15, 12], visit: [14, 12], facing: -1,
      quickPrompts: ['O que anotei ontem?', 'Juntar as notas da semana']
    }
  ];

  // Cenas gravadas. Cada passo é uma lista de "beats" executados em ordem.
  // walk: anda até o alvo · say: fala · st: muda status · wait: espera · home: volta pra mesa.
  const SCENES = [
    {
      key: 'whatsapp-checkup',
      title: 'Pedido pelo WhatsApp',
      route: 'Recepção → Sala Técnica',
      steps: [
        { caption: 'Chega uma mensagem: “como tá a nuvem?”', beats: [
          { st: { 'whatsapp-orchestrator': 'working', 'devops-observabilidade': 'ready', 'suporte-saude-bugs': 'ready' } },
          { say: 'whatsapp-orchestrator', text: 'Querem saber se tá tudo no ar. Isso é com o DevOps.' }
        ] },
        { caption: 'O Orchestrator leva o pedido até a Sala Técnica.', beats: [
          { walk: 'whatsapp-orchestrator', to: 'devops-observabilidade', carry: true },
          { st: { 'devops-observabilidade': 'queued' } },
          { say: 'whatsapp-orchestrator', text: 'Dá uma olhada geral? Sem mexer, tá?' },
          { home: 'whatsapp-orchestrator', parallel: true }
        ] },
        { caption: 'DevOps confere tudo e pede ajuda ao Suporte.', beats: [
          { st: { 'devops-observabilidade': 'working' } },
          { say: 'devops-observabilidade', text: 'Os sites e serviços estão respondendo.' },
          { walk: 'devops-observabilidade', to: 'suporte-saude-bugs', carry: true },
          { say: 'devops-observabilidade', text: 'Vê se tem algo travado?' },
          { st: { 'suporte-saude-bugs': 'working' } },
          { say: 'suporte-saude-bugs', text: 'Nada travado. Tem fôlego de sobra.' }
        ] },
        { caption: 'A resposta volta pra Recepção. Nada foi alterado.', beats: [
          { st: { 'suporte-saude-bugs': 'ready' } },
          { walk: 'devops-observabilidade', to: 'whatsapp-orchestrator', carry: true },
          { say: 'devops-observabilidade', text: 'Tudo verde. Não mexi em nada.' },
          { home: 'devops-observabilidade', parallel: true },
          { say: 'whatsapp-orchestrator', text: 'Respondido no WhatsApp.' },
          { st: { 'devops-observabilidade': 'ready', 'whatsapp-orchestrator': 'ready' } }
        ] }
      ]
    },
    {
      key: 'coleta-fast-path',
      title: 'Notas da faculdade',
      route: 'Dia a dia',
      steps: [
        { caption: 'A Agenda pede as notas da semana.', beats: [
          { st: { 'agenda-semana': 'working', 'faculdade-suap': 'ready', 'insights-diario': 'ready' } },
          { walk: 'agenda-semana', to: 'faculdade-suap', carry: true },
          { say: 'agenda-semana', text: 'Preciso do boletim pra fechar a semana.' },
          { st: { 'faculdade-suap': 'queued' } },
          { home: 'agenda-semana', parallel: true }
        ] },
        { caption: 'O SUAP entra no portal da faculdade e pega só as notas.', beats: [
          { st: { 'faculdade-suap': 'working', 'agenda-semana': 'ready' } },
          { say: 'faculdade-suap', text: 'Peguei em menos de um segundo.' },
          { walk: 'faculdade-suap', to: 'insights-diario', carry: true },
          { say: 'faculdade-suap', text: 'Guarda isso no diário?' },
          { st: { 'insights-diario': 'queued' } },
          { home: 'faculdade-suap', parallel: true }
        ] },
        { caption: 'Insights guarda tudo, sem repetir nada.', beats: [
          { st: { 'insights-diario': 'working', 'faculdade-suap': 'ready' } },
          { say: 'insights-diario', text: '4 registros novos, 2 já existiam.' },
          { wait: 1200 },
          { st: { 'insights-diario': 'ready' } }
        ] }
      ]
    },
    {
      key: 'auditoria-rls-guardrail',
      title: 'Revisão antes de lançar',
      route: 'Estúdio → Sala Técnica',
      steps: [
        { caption: 'Antes de lançar, o Nexus quer conferir quem pode ver o quê.', beats: [
          { st: { 'nexus-pesquisa': 'working', 'supabase-db': 'ready', 'cloud-ops': 'ready' } },
          { say: 'nexus-pesquisa', text: 'Antes de lançar, quero conferir os acessos.' },
          { walk: 'nexus-pesquisa', to: 'supabase-db', carry: true },
          { st: { 'supabase-db': 'queued' } },
          { say: 'nexus-pesquisa', text: 'Vê se cada um só enxerga o que é seu?' },
          { home: 'nexus-pesquisa', parallel: true }
        ] },
        { caption: 'Supabase acha duas brechas e leva a correção pro Cloud Ops.', beats: [
          { st: { 'supabase-db': 'working', 'nexus-pesquisa': 'ready' } },
          { say: 'supabase-db', text: 'Achei duas brechas. Já sei como fechar.' },
          { walk: 'supabase-db', to: 'cloud-ops', carry: true },
          { st: { 'cloud-ops': 'queued' } },
          { say: 'supabase-db', text: 'Aplica quando liberarem?' },
          { home: 'supabase-db', parallel: true }
        ] },
        { caption: 'Cloud Ops para e espera alguém aprovar.', beats: [
          { st: { 'supabase-db': 'ready', 'cloud-ops': 'waiting' } },
          { say: 'cloud-ops', text: 'Isso mexe no sistema de verdade. Espero sua aprovação.' }
        ] }
      ]
    }
  ];

  const CURATED_FEED = [
    { title: 'Engenharia reversa de motion + storyboard', url: 'https://x.com/magdiel_rb/status/2125181804118458747', source: '@magdiel_rb', date: '24 nov', applied: 'Quem recebe a tarefa reage quando ela chega.' },
    { title: '6 UI design skills that give your agent real taste', url: 'https://x.com/MengTo/status/2122984275566076395', source: '@MengTo', date: '23 nov', applied: 'Cartões com contraste firme, sem bege.' },
    { title: '8 projetos de vídeo e animação em código', url: 'https://x.com/guiitib/status/2124859740362588403', source: '@guiitib', date: '23 nov', applied: 'Cenas que repetem igualzinho, passo a passo.' },
    { title: '5 skills that kill AI slop', url: 'https://x.com/Dionisselamii/status/2123871446913229285', source: '@Dionisselamii', date: '22 nov', applied: 'Animações curtas e números alinhados.' },
    { title: 'unslop-ui (U1–U25)', url: 'https://x.com/fildotai/status/2123086579388277020', source: '@fildotai', date: '22 nov', applied: 'Avisa quando é simulação, sem enfeite.' }
  ];

  // Guarda-roupa: no modo Comandante dá pra trocar; no Visitante só dá pra ver.
  const WARDROBE = {
    bodies: ['#5fd3b8', '#4b8fd8', '#8cc6ff', '#f08f6f', '#38b896', '#9fadd8', '#7465d6', '#a597ff', '#ff7cb8', '#d8a57a', '#f6b73c', '#eef2fb', '#ffb38a'],
    hats: [
      { key: 'none', label: 'Nada', color: '#000' },
      { key: 'bubble', label: 'Balão', color: '#f3f5ff' },
      { key: 'terminal', label: 'Tela', color: '#0a1230' },
      { key: 'cloud', label: 'Nuvem', color: '#f3f5ff' },
      { key: 'radar', label: 'Antena', color: '#f3f5ff' },
      { key: 'db', label: 'Pilha', color: '#23896f' },
      { key: 'hardhat', label: 'Capacete', color: '#ffd27a' },
      { key: 'atom', label: 'Átomo', color: '#ffd27a' },
      { key: 'pin', label: 'Pino do Viu', color: '#ffd27a' },
      { key: 'beret', label: 'Boina', color: '#0a1230' },
      { key: 'books', label: 'Livros', color: '#5674c8' },
      { key: 'grad', label: 'Capelo', color: '#0a1230' },
      { key: 'calendar', label: 'Calendário', color: '#f08f6f' },
      { key: 'bulb', label: 'Lâmpada', color: '#fff3c9' },
      { key: 'crown', label: 'Coroa', color: '#ffd27a' }
    ],
    outfits: [
      { key: 'none', label: 'Nada' },
      { key: 'scarf', label: 'Cachecol' },
      { key: 'bowtie', label: 'Gravata-borboleta' },
      { key: 'vest', label: 'Colete' },
      { key: 'hoodie', label: 'Moletom' },
      { key: 'badge', label: 'Crachá' },
      { key: 'cape', label: 'Capa' },
      { key: 'headphones', label: 'Fone' }
    ],
    outfitColors: ['#0a1230', '#f3f5ff', '#ffd27a', '#ff6b6b', '#5fd3b8', '#3563d9', '#ff7cb8', '#a597ff']
  };

  // Grupos extras (opcional). Agente sem `seat` e com `roomKey` novo ganha sala sozinho (layout.js).
  // Aqui só dá nome e cor: { key: 'financeiro', name: 'Financeiro', accent: '#ffc35c', proof: 'Contas e notas' }
  const GROUPS = [];

  // "Pergunte ao escritório": palavras que levam o pedido a cada agente.
  // É um roteador de propósito simples (sem IA), pra mostrar a ideia de triagem.
  const ROUTER = {
    'whatsapp-orchestrator': ['whatsapp', 'mensagem', 'mensagens', 'responder', 'resposta', 'atendimento'],
    'assistente-codex': ['codigo', 'programar', 'bug no codigo', 'tarefa', 'tarefas', 'coordenar', 'script', 'pendente'],
    'cloud-ops': ['servidor', 'deploy', 'publicar', 'memoria', 'vps', 'nuvem', 'reiniciar', 'instalar', 'atualizar'],
    'devops-observabilidade': ['no ar', 'fora do ar', 'caiu', 'lento', 'site', 'saude', 'monitorar', 'status', 'viunacidade'],
    'supabase-db': ['banco', 'dados', 'tabela', 'acesso', 'senha', 'quem pode', 'permissao', 'consulta'],
    'suporte-saude-bugs': ['erro', 'travou', 'falha', 'problema', 'quebrou', 'nao funciona', 'bug'],
    'nexus-pesquisa': ['pesquisa', 'pesquisar', 'arquitetura', 'teste', 'testar', 'ideia', 'estudo'],
    'viu-mercado-adocao': ['viu', 'piloto', 'produto', 'usuarios', 'metricas', 'mercado', 'cidade'],
    'pitch-design': ['apresentacao', 'slide', 'slides', 'deck', 'design', 'pitch'],
    'curador-threads-links': ['ler', 'leitura', 'artigo', 'thread', 'link', 'resumir', 'resumo'],
    'faculdade-suap': ['nota', 'notas', 'faculdade', 'prova', 'suap', 'boletim', 'aula', 'prazo'],
    'agenda-semana': ['agenda', 'semana', 'reuniao', 'compromisso', 'horario', 'amanha', 'calendario'],
    'insights-diario': ['diario', 'anotei', 'anotacao', 'nota pessoal', 'lembrar', 'ontem', 'registro']
  };

  // Tour de 1 minuto (botão "Ver em 1 minuto"). dur em segundos.
  const TOUR = [
    { dur: 6, text: 'Este é o escritório dos agentes de IA do OpenBot. Cada bonequinho é um agente; cada sala, um tipo de trabalho.' },
    { dur: 6, room: 'hub', text: 'Tudo começa na Recepção: o Orchestrator lê cada pedido que chega pelo WhatsApp e escolhe quem resolve.' },
    { dur: 6, room: 'infra', text: 'Na Sala Técnica os agentes só observam. Mexer no servidor sempre espera alguém aprovar.' },
    { dur: 5, room: 'lab', text: 'No Estúdio ficam pesquisa, produto e apresentações, cada projeto no seu canto.' },
    { dur: 5, room: 'ops', text: 'No Dia a dia, as rotinas pessoais: notas da faculdade, agenda e diário.' },
    { dur: 22, scene: 'whatsapp-checkup', text: 'Agora um pedido de verdade andando de sala em sala. O cartão de rastreio mostra cada etapa e quanto tempo levou.' },
    { dur: 6, panels: true, text: 'Tudo o que você viu tem a chamada real do sistema na aba “Por baixo dos panos”.' },
    { dur: 5, text: 'Clique em qualquer agente pra conhecer, ou pergunte algo ao escritório.' }
  ];

  return { FLOOR, ROOMS, PARTITIONS, AGENTS, SCENES, CURATED_FEED, WARDROBE, GROUPS, ROUTER, TOUR };
})();
