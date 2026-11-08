# ADR 0002 — Vite e escritório em pixel art com Phaser

- Status: aceito
- Data: 2026-11-08
- Etapa: 3

## Contexto

Na Etapa 2 a página era uma lista de mesas em HTML, compilada pelo próprio servidor com
esbuild a cada pedido de `/app.js` (ADR 0001). A Etapa 3 troca a lista por um escritório
em pixel art, com as corujas sentando, digitando, levantando e entregando o trabalho, e com
o retrabalho do QA em destaque.

O Phaser é uma biblioteca grande (~1,4 MB). O ADR 0001 já previa reavaliar o Vite nesta etapa.

Restrições: manter um processo e uma porta (`npm run dev`), as checagens de segurança
(Host, Origin, CSP) e o protocolo `office.snapshot`; não mudar o contrato de eventos.

## Decisão

1. **Vite em modo middleware dentro do servidor do OF.** O Vite não abre servidor próprio:
   o `server.ts` passa para ele as requisições HTTP que já passaram pela checagem de `Host`.
   O WebSocket do Vite (recarregar a página sozinha ao salvar) usa a mesma porta, no caminho
   `/__vite_hmr`, e também passa pela checagem de `Host` e `Origin` do OF.
   - `vite.config.ts` limita o que o Vite pode ler (`server.fs.allow`): `web/`, `src/domain`
     e `node_modules`. Arquivos como `package.json`, `logs/` e `.claude/` respondem 403.
   - `npm run build` gera a página pronta em `dist/web`; `npm start` serve essa pasta com o
     servidor estático da Etapa 2 (mesmas regras de path traversal e tipos de arquivo).
   - `vitest.config.ts` existe só para o Vitest não herdar a raiz `web/` do Vite.
2. **Phaser 4** desenha o escritório num `<canvas>` (`web/src/office/`). O painel em HTML
   (mesas e últimas entregas) continua embaixo: mostra o texto completo das tarefas e é
   acessível para leitores de tela.
3. **Pixel art feita em código, sem arquivos de imagem.** Cada coruja é um desenho de
   texto 16x18 (`sprites.ts`): cada letra é um pixel com uma cor da paleta. O acessório de
   cada papel é outro desenho sobreposto (óculos e planta, teclado, escudo, lupa, capacete).
   Móveis e sala são formas simples (retângulos). Sem sprites de terceiros, sem licença a conferir.
4. **Coreografia pura** (`choreography.ts`): compara a foto anterior com a nova e decide as
   animações (`reset`, `sit`, `retask`, `standUp`, `deliver`, `lights`). É testada no Vitest
   sem navegador. A cena do Phaser só executa a lista, uma animação de cada vez.
   - Primeira foto, reconexão ou novo expediente: monta a cena direto, sem animar.
   - Se acumularem mais de 6 animações (ex.: `simulate --fast`), pula para o estado mais novo.
5. **Retrabalho em destaque:** faixa vermelha "RETRABALHO", papel vermelho girando, tela
   tremendo, anel vermelho na mesa do Engenheiro, balão com borda vermelha enquanto ele
   corrige e contador "retrabalhos do QA" no quadro branco.
6. **CSP:** `img-src` passou a aceitar `data:`, porque o Phaser embute algumas texturas
   internas como imagem base64. Nada mais foi afrouxado: sem `unsafe-inline` nem `unsafe-eval`.
   O texto das tarefas é desenhado no canvas pelo Phaser (nunca vira HTML).

## Alternativas descartadas

- **Vite como segundo servidor, com proxy para o WebSocket do OF:** duas portas, dois
  processos e a CSP/Origin teriam de aceitar as duas. O modo middleware mantém uma porta só.
- **Continuar com esbuild no servidor:** funciona, mas sem recarregar sozinho e sem build de
  produção; cada F5 recompilaria o Phaser inteiro.
- **Desligar o recarregamento automático do Vite (HMR):** evitaria o segundo WebSocket, mas
  é a principal vantagem do Vite para quem está aprendendo (salvar e ver na hora). Como ele
  passa pelas mesmas checagens do `/ws`, o risco é o mesmo.
- **Sprites gratuitos da internet:** exigiriam conferir licença e créditos, e fariam
  `img-src` liberar mais coisas. Fica para quando houver arte definitiva.
- **Phaser 3:** o 4 é a versão atual, com API quase igual para o que usamos (sprites,
  tweens, textos, gráficos).
- **Calcular as animações dentro da cena do Phaser:** misturaria regra com desenho e não
  daria para testar sem navegador.

## Consequências

- Dependências novas: `phaser` (execução) e `vite` (desenvolvimento). O `esbuild` deixou de
  ser dependência direta (o `tsx` ainda o usa por dentro).
- `web/index.html` saiu de `web/public` (o Vite exige o HTML na raiz da página).
- Node mínimo passa a ser 22.12 (o Vite 8 pede 20.19+ e o Vitest 5, já usado desde a Etapa 1, pede 22.12+).
- O pacote final tem ~1,4 MB (365 kB comprimido), quase tudo do Phaser.
