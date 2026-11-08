# 🦉 OwllFloor

**An AI dev team you can watch working.**

O OwllFloor é um escritório em pixel art onde cada coruja é um subagente do Claude Code:
**Arquiteto, Engenheiro, Segurança, QA e DevOps**. Quando você pede uma funcionalidade ao
Claude Code, ele delega o trabalho entre as corujas — e você vê cada uma sentar na mesa,
trabalhar, levantar e entregar a tarefa para a próxima.

Nada é encenado: a tela reage a **eventos reais** gerados pelos hooks do Claude Code.
O OwllFloor não chama nenhuma API de IA; ele só observa e mostra.

## Status

🚧 **Etapa 2 concluída — o escritório no navegador.** Um servidor local lê os eventos e
transmite o estado por WebSocket para uma página simples. A versão em pixel art (Phaser) é a
próxima etapa.

| Etapa | Entrega | Status |
|---|---|---|
| 1 | Subagentes, hooks, contrato de eventos, reducer e escritório no terminal | ✅ |
| 2 | Servidor WebSocket transmitindo os eventos | ✅ |
| 3 | Escritório visual em Phaser com as corujas | ⏳ |
| 4 | Docker, CI e vídeo demo | ⏳ |

## Como funciona

```mermaid
flowchart LR
    U[Você pede uma funcionalidade] --> C[Claude Code]
    C -->|delega| A[Subagentes<br/>.claude/agents]
    A -->|hooks| H[emit-event.mjs]
    H -->|1 linha JSON por evento| F[(logs/events.ndjson)]
    F -->|observa| W[EventFileWatcher]
    W --> R[officeReducer]
    R --> T[Terminal<br/>npm run watch]
    R --> S[Servidor local<br/>npm run dev]
    S -->|WebSocket<br/>office.snapshot| B[Página no navegador<br/>pixel art na Etapa 3]
```

**Fluxo do expediente:** Arquiteto → Engenheiro → Segurança → QA → DevOps.
Se o QA reprovar, a entrega volta para o Engenheiro (retrabalho) e passa de novo por Segurança e QA.

## Rodando

Pré-requisitos: Node 20+ e Claude Code.

```bash
git clone https://github.com/FelipeeBrito/OwllFloor.git
cd OwllFloor
npm install
```

> Se o `npm install` avisar que o script de instalação (`postinstall`) do `esbuild` foi
> bloqueado e o `npm run dev` der erro ao compilar a página, libere com
> `npm install-scripts approve esbuild` e rode `npm install` de novo.

**Ver o escritório no navegador com uma simulação** (não usa o Claude):

```bash
# terminal 1 — abre http://127.0.0.1:4747 sozinho
npm run dev

# terminal 2
npm run simulate
```

Variáveis opcionais do `npm run dev`:

| Variável | Para quê | Padrão |
|---|---|---|
| `OF_PORT` | porta do servidor (1–65535) | `4747` |
| `OF_NO_OPEN=1` | não abrir o navegador sozinho | abre |
| `OF_EVENTS_FILE` | arquivo de eventos lido | `logs/events.ndjson` |

O jeito de definir a variável muda conforme o terminal:

```powershell
# Windows (PowerShell) — vale para esta janela do terminal
$env:OF_PORT=4848; npm run dev
$env:OF_NO_OPEN=1; npm run dev
```

```bash
# Git Bash, Mac ou Linux — vale só para este comando
OF_PORT=4848 npm run dev
OF_NO_OPEN=1 npm run dev
```

No PowerShell a variável continua definida até fechar a janela; para desfazer, use
`Remove-Item Env:OF_PORT`.

O servidor escuta só em `127.0.0.1` (não aparece para outras máquinas da rede).
Mudanças na página aparecem com F5; mudanças no servidor pedem reiniciar o `npm run dev`.

**Ver o escritório no terminal com uma simulação:**

```bash
# terminal 1
npm run watch

# terminal 2
npm run simulate
```

**Ver o escritório com o Claude de verdade:**

```bash
# terminal 1 (ou npm run watch, para o modo texto)
npm run dev

# terminal 2, dentro da pasta do projeto
claude
```

Depois peça uma funcionalidade ao Claude Code, por exemplo: *"use o fluxo do escritório para
criar uma função que formata datas em pt-BR"*. As corujas começam a trabalhar na página (ou no terminal 1).

## Decisões técnicas

- **Eventos em arquivo NDJSON**, não em banco ou fila: é o jeito mais simples de os hooks
  (processos curtos) conversarem com o escritório (processo longo). Pode virar WebSocket ou
  mensageria depois, sem mudar o domínio.
- **Reducer puro** (`estado + evento → novo estado`): cada regra é testável isoladamente e um
  expediente inteiro pode ser reproduzido relendo o arquivo.
- **Observer** no leitor de eventos: o terminal hoje e a tela em Phaser amanhã se inscrevem
  na mesma fonte.
- **Servidor local com WebSocket** ([ADR 0001](docs/adr/0001-servidor-websocket.md)): um único
  processo lê os eventos, serve a página e transmite sempre a *foto completa* do estado
  (`office.snapshot`). Se a conexão cair, a página reconecta sozinha e já recebe a tela certa.
  Segurança básica: só `127.0.0.1`, checagem de `Host` e `Origin`, CSP restritiva e texto dos
  eventos exibido só com `textContent`.
- **Hook sem dependências e que nunca falha**: o escritório é visual; ele jamais pode
  atrapalhar o trabalho do Claude Code.

Melhorias já conhecidas e ainda não feitas estão em
[Pendentes conhecidos](docs/adr/0001-servidor-websocket.md#pendentes-conhecidos).

## Estrutura

```
.claude/
  agents/          # as 5 corujas (subagentes)
  hooks/           # emit-event.mjs: hook → evento
  settings.json    # quais momentos do Claude Code disparam o hook
src/
  domain/          # regras puras: papéis, eventos, reducer
  infra/           # leitura do arquivo de eventos
  cli/             # escritório em modo texto
  server/          # servidor local: HTTP + WebSocket (npm run dev)
web/
  public/          # index.html e style.css
  src/             # TypeScript da página (compilado na hora pelo servidor)
docs/adr/          # decisões de arquitetura
scripts/simulate.ts
tests/             # Vitest
```

## Testes

```bash
npm test          # 157 testes
npm run typecheck
```

## Débito técnico conhecido

Coisas que sabemos que podem melhorar, mas que hoje têm gravidade **baixa**. Cada item diz
por que é baixo, quando passaria a valer a pena corrigir e quanto custa corrigir.
Detalhes em `docs/adr/0001-servidor-websocket.md`.

- **B1 — outros sites podem incluir o `/app.js`** (gravidade: baixa).
  Falta o cabeçalho `Cross-Origin-Resource-Policy: same-origin` e recusar pedidos com
  `Sec-Fetch-Site: cross-site`.
  *Por que é baixa:* o `app.js` é o código público da página, sem nenhum dado. Os dados vêm
  pelo WebSocket, que já confere de qual site veio a conexão (`Origin`).
  *Corrigir quando:* o JavaScript passar a conter dados sensíveis.
  *Custo:* um cabeçalho e um `if`.
- **B2 — abrir o navegador no Windows sem validar a URL** (gravidade: baixa).
  `openBrowser` não confere a URL antes de chamar o `spawn`.
  *Por que é baixa:* a URL é montada só com o endereço fixo `127.0.0.1` e uma porta numérica;
  nada vem de fora.
  *Corrigir quando:* a URL passar a vir de configuração.
  *Custo:* uma checagem com `^http://127\.0\.0\.1:\d+/$`.
- **B3 — atalhos (symlinks) em `web/public` são seguidos** (gravidade: baixa).
  *Por que é baixa:* para explorar isso alguém precisa criar um atalho dentro do repositório,
  o que exige a mesma confiança de editar o próprio código; e o servidor só atende a máquina
  local.
  *Corrigir quando:* aceitarmos contribuições externas em `web/public`.
  *Custo:* usar `realpath` e conferir que o destino continua dentro da pasta.
- **Watcher não percebe arquivo recriado do mesmo tamanho ou maior** (gravidade: baixa).
  O leitor só detecta que `events.ndjson` foi recriado quando ele fica menor. Se um arquivo
  novo chegar ao mesmo tamanho ou maior entre duas leituras (ex.: `simulate --fast` repetido),
  eventos podem ser perdidos ou lidos do meio.
  *Por que é baixa:* não acontece no uso normal, em que o arquivo só cresce.
  *Corrigir quando:* isso começar a aparecer na prática.
  *Custo:* comparar também a identidade do arquivo (ex.: data de criação), não só o tamanho.
- **`postinstall` do esbuild bloqueado** (gravidade: baixa).
  Versões novas do npm podem bloquear o script de instalação do `esbuild`.
  *Por que é baixa:* não é falha de segurança; só impede a página de compilar.
  *Como resolver:* rodar `npm install-scripts approve esbuild` e `npm install` de novo.

## Licença

MIT
