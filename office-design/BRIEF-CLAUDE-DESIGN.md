# Brief para o Claude Design — Agent Office

Cole o bloco abaixo no Claude Design. Anexe 3 prints: o andar inteiro, uma sala isolada e a ficha de um agente aberta.

---

**Projeto:** Agent Office. É um escritório isométrico, no estilo Habbo, onde 13 agentes de IA (os "Olheiros") trabalham em 4 salas: Recepção, Sala Técnica, Estúdio e Dia a dia. Serve de portfólio pra recrutadores e de painel privado pro dono (modo Comandante).

**Identidade (não mudar):** a mesma da LP viunacidade.com.br.
- Céu noturno em degradê: `#070d2a → #0c1945 → #152a62 → #24407f`.
- Âmbar `#ffd27a` significa "aceso" ou "ativo". Menta `#5bd1b5` significa "ok". Coral `#ff6b6b` significa "precisa de você". Lilás `#a597ff` significa "na fila".
- Cartões claros: `#ffffff` sobre `#eef2fb`, texto `#0a1230`.
- Tipografia: Outfit 300–500 nos títulos, com tracking bem negativo (-0.04em). Manrope 500–800 no resto.
- Forma de fala: `border-radius: 14px 14px 14px 4px`, usada em botões e balões.
- Os personagens são caixas com olhões âmbar retangulares e um objeto no lugar do chapéu. O mapa é isométrico flat em 3 tons de azul.

**O que eu quero que você redesenhe:**

1. **Ficha do agente (gaveta à direita).** Hoje ela é uma coluna longa demais: retrato, nome, status, resumo, 4 fatos, guarda-roupa inteiro e tarefas, tudo empilhado. Quero:
   - Um cabeçalho compacto: retrato grande à esquerda e, à direita, nome, sala e status num chip.
   - O resumo em no máximo 2 linhas.
   - Abas: **Sobre** · **Visual** · **Tarefas** (Tarefas só no modo Comandante).
   - Na aba Visual, um provador de roupa. O retrato fica grande no centro, com carrosséis horizontais embaixo: cor, chapéu, roupa e cor da roupa. O botão "Vestir" fica fixo no rodapé. No modo Visitante, o botão aparece bloqueado com um cadeado e a frase "Só o Comandante veste".
   - Os 4 fatos (IA usada, reserva, regra, visto por último) viram uma linha de 4 ícones pequenos com legenda, não uma tabela.
   - Rolagem só dentro do corpo da ficha. O cabeçalho e o rodapé ficam fixos.
2. **Painel "Por baixo dos panos".** Hoje mostra um registro de eventos com texto técnico. Quero que pareça uma linha do tempo de entregas:
   - Cada item é um cartãozinho com ícone, frase curta e horário.
   - A chamada técnica (ex.: `POST /v1/agents/devops/messages → 202`) aparece só ao expandir o item.
   - No topo, um mini diagrama de 4 nós (WhatsApp → OpenBot → Agentes → Esta página) que acende quando algo passa.
3. **Menu lateral com hambúrguer.** A lateral tem título, "Ver em 1 minuto", 3 cenas e "Pergunte ao escritório". Quero:
   - O ícone hambúrguer virando X com uma animação elástica.
   - O painel entrando e saindo com os itens em cascata.
   - No celular, o painel virando uma gaveta que vem de baixo.

**Regras:**
- Pouco texto. Nada de jargão técnico na primeira camada, só na camada expandida.
- Contraste AA. Nada de bege, nada de gradiente em texto, nada de emoji como ícone.
- O mapa é a estrela: nenhum painel deve cobrir mais de 30% dele no desktop.
- Mostre os 2 modos (Visitante e Comandante) e as larguras de 1440 px e 390 px.
- Entregue os componentes com tokens (cores, raios, sombras, espaçamentos) pra eu levar de volta pro código.

---

## Por que essas direções

- **Ficha longa demais:** o guarda-roupa sozinho tem mais de 40 botões. Com abas, cada assunto cabe numa tela.
- **Rastro técnico:** recrutador entende "Orchestrator passou o pedido pro DevOps". O `POST …` serve pra quem quer conferir, então fica um clique abaixo.
- **Regra dos 30%:** a ficha (400 px), o painel (380 px) e a lateral (320 px) juntos já tomavam metade da tela.
