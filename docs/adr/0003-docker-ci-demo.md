# ADR 0003 — Modo demo, Docker e CI

- Status: aceito
- Data: 2026-11-13
- Etapa: 4

## Contexto

Até a Etapa 3, ver o escritório exigia Node instalado, dois terminais e, para o uso real, o
Claude Code. Para portfólio, quem visita o repositório precisa ver o projeto funcionando com
um comando. Também faltava uma verificação automática a cada commit.

Restrições: o OF continua sem chamar API de IA, o contrato de eventos não muda e o servidor
continua inacessível pela rede.

## Decisão

1. **Modo demo (`npm run demo`).** O servidor toca um expediente de exemplo em repetição.
   O demo grava num arquivo temporário e o servidor o lê com o mesmo `EventFileWatcher` do uso
   real, então o caminho dos dados é o de produção; só a origem dos eventos muda. O arquivo
   `logs/events.ndjson` nunca é tocado pelo demo. O roteiro fica em `src/demo/sample-session.ts`
   e é o mesmo do `npm run simulate`.

2. **Docker em duas fases.** A primeira instala e compila a página; a segunda só roda, com o
   usuário sem privilégios `node`. O comando padrão da imagem é o demo, que não precisa de
   configuração. O serviço `office` do `compose.yaml` monta `./logs` só para leitura e mostra
   os eventos reais.

3. **Rede no container.** Dentro do container, `127.0.0.1` é o próprio container, e a porta
   publicada pelo Docker não chegaria ao servidor. `OF_BIND_ALL=1` (ligado só na imagem) faz o
   servidor escutar em `0.0.0.0` *dentro do container*. O acesso continua restrito por duas
   camadas: a porta é publicada como `127.0.0.1:4747:4747`, e a checagem de Host/Origin segue
   aceitando apenas `127.0.0.1` e `localhost`.

4. **CI no GitHub Actions.** A cada push na `main` e em pull requests: tipos, testes, build,
   `npm audit` das dependências de produção e, em seguida, construção da imagem Docker com um
   teste de fumaça (sobe o demo e confere se a página responde).

## Alternativas descartadas

- **Demo gerando eventos direto na memória do servidor:** mais simples, mas criaria um segundo
  caminho de dados que só existe no demo e poderia esconder defeitos do caminho real.
- **Hospedar o demo num serviço público:** o servidor foi desenhado para rodar só na máquina
  local (ADR 0001). Publicar exigiria rever Host, Origin e CSP; fica para depois, se fizer falta.
- **Imagem sem as dependências de desenvolvimento:** o servidor roda TypeScript com `tsx` e
  importa o Vite. Separar isso pede compilar o servidor para JavaScript; anotado como débito.

## Consequências

- Qualquer pessoa com Docker vê o escritório com `docker compose up demo`.
- A imagem carrega dependências de desenvolvimento (maior do que o necessário).
- Publicar a porta com números diferentes (ex.: `8080:4747`) não funciona: o servidor recusa
  o Host. É proposital e está documentado no `compose.yaml`.
- A imagem Docker não foi construída na máquina onde este ADR foi escrito (sem Docker
  disponível); a primeira verificação real é o job `docker` do CI.
