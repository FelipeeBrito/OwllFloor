# OwllFloor (OF) — instruções para o Claude Code

## O que é
Escritório visual em pixel art onde corujas representam os subagentes do Claude Code.
As corujas se movem com base em **eventos reais** gravados pelos hooks em `logs/events.ndjson`.
O OF **nunca chama a API do Claude**: ele só lê e exibe eventos. Não adicione SDK nem chaves de API.

## Dono do projeto
Iniciante em programação, aprendendo enquanto constrói. Antes de mudanças relevantes,
explique a decisão em português simples (o quê, por quê e qual alternativa foi descartada).

## Fluxo de trabalho do escritório
Para qualquer funcionalidade nova, delegue nesta ordem, usando os subagentes de `.claude/agents/`:

1. `arquiteto` — plano técnico
2. `engenheiro` — implementação com testes
3. `seguranca` — revisão de segurança
4. `qa` — validação; se `REPROVADO`, volte ao `engenheiro` e depois repita `seguranca` e `qa`
5. `devops` — preparação da entrega

Cada delegação vira uma coruja trabalhando na tela, então use sempre esses nomes de subagente
e escreva uma `description` curta e clara na chamada (ela aparece no balão da coruja).

## Stack
TypeScript (estrito), Node >= 20, Vitest. Próximas etapas: Phaser (escritório visual) e WebSocket.

## Estrutura
- `src/domain` — regras puras (eventos, papéis, reducer do escritório). Sem acesso a arquivos ou rede.
- `src/infra` — leitura de arquivos e integrações.
- `src/cli` — escritório em modo texto (`npm run watch`).
- `.claude/hooks/emit-event.mjs` — traduz hooks do Claude Code em eventos do OF.
- `tests/` — testes Vitest.

## Comandos
- `npm test` — testes
- `npm run typecheck` — checagem de tipos
- `npm run watch` — escritório no terminal
- `npm run simulate` — gera um expediente de exemplo, sem usar o Claude

## Regras
- Contrato de eventos em `src/domain/events.ts`. Se mudar, atualize o hook e os testes juntos.
- Commits no padrão Conventional Commits. Não faça push sem o dono pedir.
