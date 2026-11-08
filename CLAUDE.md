# OwllFloor (OF) — instruções para o Claude Code

## O que é
Escritório visual em pixel art onde corujas representam os subagentes do Claude Code.
As corujas se movem com base em **eventos reais** gravados pelos hooks em `logs/events.ndjson`.
O OF **nunca chama a API do Claude**: ele só lê e exibe eventos. Não adicione SDK nem chaves de API.

## Dono do projeto
Iniciante em programação, aprendendo enquanto constrói. Antes de mudanças relevantes,
explique a decisão em português simples (o quê, por quê e qual alternativa foi descartada).

## Modo de trabalho
- Durante o desenvolvimento, trabalhe direto: **não delegue para os subagentes**.
- Respostas curtas.

## Fluxo das cinco corujas (só no teste final)
Use este fluxo apenas quando o dono pedir o teste final. Delegue nesta ordem, usando os subagentes de `.claude/agents/`:

1. `arquiteto` — plano técnico
2. `engenheiro` — implementação com testes
3. `seguranca` — revisão de segurança
4. `qa` — validação; se `REPROVADO`, volte ao `engenheiro` e depois repita `seguranca` e `qa`
5. `devops` — preparação da entrega

Cada delegação vira uma coruja trabalhando na tela, então use sempre esses nomes de subagente
e escreva uma `description` curta e clara na chamada (ela aparece no balão da coruja).

## Stack
TypeScript (estrito), Node >= 20, Vitest, `ws` (WebSocket) e esbuild (compila a página em memória).
Próxima etapa: Phaser (escritório visual). Decisões da Etapa 2 em `docs/adr/0001-servidor-websocket.md`.

## Estrutura
- `src/domain` — regras puras (eventos, papéis, reducer do escritório). Sem acesso a arquivos ou rede.
- `src/infra` — leitura de arquivos e integrações.
- `src/cli` — escritório em modo texto (`npm run watch`).
- `src/server` — servidor local (HTTP + WebSocket na mesma porta, só em 127.0.0.1). Regras puras
  (`office-hub`, `security`, `static-files`, `config`, `open-browser`) separadas das bordas (`server.ts`, `main.ts`).
- `src/domain/protocol.ts` — mensagem `office.snapshot` enviada ao navegador (usada pelo servidor e pela página).
- `web/public` — `index.html` e `style.css` servidos como estão.
- `web/src` — TypeScript da página (`app.ts`, `dom.ts`, `view-model.ts`), com `web/tsconfig.json` próprio (DOM, sem Node).
  Na página, texto de evento só com `textContent` (nunca `innerHTML`).
- `.claude/hooks/emit-event.mjs` — traduz hooks do Claude Code em eventos do OF.
- `tests/` — testes Vitest.

## Comandos
- `npm test` — testes
- `npm run typecheck` — checagem de tipos (Node e página)
- `npm run dev` — escritório no navegador em http://127.0.0.1:4747 (abre sozinho)
  - `OF_PORT=4848` muda a porta; `OF_NO_OPEN=1` não abre o navegador; `OF_EVENTS_FILE` muda o arquivo lido
- `npm run watch` — escritório no terminal
- `npm run simulate` — gera um expediente de exemplo, sem usar o Claude

## Regras
- Contrato de eventos em `src/domain/events.ts`. Se mudar, atualize o hook e os testes juntos.
- Commits no padrão Conventional Commits. Não faça push sem o dono pedir.
