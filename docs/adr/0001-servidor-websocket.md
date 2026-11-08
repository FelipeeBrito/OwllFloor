# ADR 0001 — Servidor local com WebSocket e página web simples

- Status: aceito
- Data: 2026-11-08
- Etapa: 2 (antes do Phaser)

## Contexto

Na Etapa 1 o escritório só existia no terminal (`npm run watch`). Agora queremos ver as
5 corujas e as entregas (handoffs) numa página do navegador, em tempo real, reaproveitando
o que já existe:

- `EventFileWatcher` (`src/infra/event-file-watcher.ts`) lê `logs/events.ndjson`;
- `officeReducer` (`src/domain/office.ts`) transforma eventos em `OfficeState`.

Restrições: não mudar o contrato de eventos (`src/domain/events.ts`), não usar a API do
Claude, página sem framework, poucas dependências novas, funcionar em Windows, Mac e Linux.
Na Etapa 3 a página vai virar Phaser, então a mensagem enviada ao navegador precisa ser
fácil de reaproveitar.

## Decisão

1. **Um único processo Node** (`npm run dev`) faz tudo: lê o arquivo de eventos, calcula o
   estado, serve a página por HTTP e transmite o estado por WebSocket na mesma porta.
2. **Biblioteca `ws`** no servidor. No navegador usamos o `WebSocket` nativo (sem biblioteca).
3. **esbuild em memória**: quando o navegador pede `/app.js`, o servidor compila
   `web/src/app.ts` na hora (sem gravar arquivo) e devolve o JavaScript.
4. **Mensagem = foto completa do estado** (snapshot), com tipo e versão:
   `{ type: 'office.snapshot', v: 1, state: OfficeState, event: OfficeEvent | null }`.
   - Ao conectar, o navegador recebe a foto atual imediatamente (`event: null`).
   - A cada evento novo, todos recebem a nova foto e o evento que a causou.
   - Se a conexão cair, a página tenta reconectar sozinha (1s, 2s, 4s... até 5s) e,
     ao voltar, a primeira foto já deixa a tela correta. Não há "eventos perdidos".
5. **Segurança básica**: escutar só em `127.0.0.1`; conferir `Host` em toda requisição e
   `Origin` no upgrade do WebSocket (só `http://127.0.0.1:PORTA` e `http://localhost:PORTA`);
   servir apenas arquivos dentro de `web/public`; cabeçalho CSP restritivo; o texto dos
   eventos (o `summary` vem de prompts) é colocado na tela só com `textContent`, nunca
   `innerHTML`.
6. **Separação**: regras puras e testáveis (protocolo, hub de clientes, resolução de caminho,
   checagem de origem, configuração, comando de abrir navegador, "view model" da página)
   ficam separadas das bordas (http, ws, esbuild, `child_process`, DOM).
7. **Dois tsconfig**: o atual (Node) e `web/tsconfig.json` (navegador, com `lib DOM` e sem
   tipos do Node). `npm run typecheck` roda os dois.

## Alternativas descartadas

- **Implementar o protocolo WebSocket à mão**: exige handshake com SHA-1, montar e
  desmascarar quadros binários, ping/pong e fechamento correto. É fácil errar e difícil
  testar. `ws` é pequena, sem dependências próprias e é o padrão do ecossistema Node.
- **Server-Sent Events (SSE)** em vez de WebSocket: também resolveria (só servidor→navegador),
  mas o pedido e as próximas etapas preveem WebSocket. Fica como plano B se `ws` virar problema.
- **Vite**: ótimo, mas é um segundo servidor e muitas dependências, exagero para uma página.
  Pode ser reavaliado na Etapa 3 se o Phaser pedir.
- **`tsc` gerando arquivos `.js` numa pasta**: precisaria de um passo de build ou de um
  segundo processo em modo watch, e de arquivos gerados para ignorar no git.
- **Mensagens só com o evento (delta)**: menores, mas o navegador teria que repetir o
  reducer e qualquer mensagem perdida deixaria a tela errada. Com snapshot, o navegador só
  desenha. O estado tem no máximo 50 handoffs, então a mensagem continua pequena.
- **Pacote `open`** para abrir o navegador: uma dependência a mais para algo que se resolve
  com `child_process` em poucas linhas.

## Consequências

- Duas dependências novas de execução/tipos (`ws`, `@types/ws`) e uma declarada
  explicitamente (`esbuild`, que já vinha junto do `tsx`).
- Mudanças no TypeScript da página aparecem ao recarregar (F5); mudanças no servidor exigem
  reiniciar o `npm run dev`.
- O Phaser (Etapa 3) pode consumir a mesma mensagem `office.snapshot`: o `state` diz onde
  cada coruja está e o `event` diz o que acabou de acontecer (útil para animações).
- Débito conhecido: o watcher detecta "arquivo recriado" só quando o tamanho diminui. Se um
  arquivo novo atingir o mesmo tamanho ou maior entre duas leituras (ex.: `simulate --fast`
  repetido), eventos podem ser perdidos ou lidos do meio. Não afeta o uso normal.

## Pendentes conhecidos

Itens de baixo risco (revisão de segurança e QA da Etapa 2), para resolver em uma próxima entrega:

- **B1 — `/app.js` lido por outros sites:** adicionar o cabeçalho
  `Cross-Origin-Resource-Policy: same-origin` e recusar pedidos com `Sec-Fetch-Site: cross-site`.
- **B2 — abrir navegador no Windows:** validar a URL em `openBrowser` antes do `spawn`
  (hoje ela vem só da configuração interna, mas a checagem evita surpresas).
- **B3 — atalhos (symlinks) em `web/public`:** são seguidos; usar `realpath` e conferir que o
  destino continua dentro da pasta.
- **Watcher:** o débito descrito em "Consequências" (arquivo recriado com tamanho igual ou
  maior não é detectado).
- **Instalação:** versões novas do npm podem bloquear o `postinstall` do `esbuild`. Se a
  página não compilar, rodar `npm install-scripts approve esbuild` e `npm install` de novo.
- **Reavaliação (2026-11-08):** os itens acima foram reavaliados como gravidade baixa e
  registrados no README, na seção "Débito técnico conhecido".
