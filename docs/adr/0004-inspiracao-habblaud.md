# ADR 0004 — Inspiração no Habblaud

- Status: aceito
- Data: 2026-11-16

## Contexto

O [Habblaud](https://github.com/marmottajr/habblaud) (licença MIT, © 2026 Márcio Junior) é um
escritório virtual em pixel art para o Claude Code, com proposta parecida com a do OF.
Ele foi analisado **só por leitura de código e documentação**. Não foi instalado nem copiado.

O [REA](https://github.com/morluto/rea) foi avaliado como referência de análise de software,
mas não entra no projeto.

Restrições que continuam valendo: o OF só lê e exibe eventos (`logs/events.ndjson`), não chama
a API do Claude e não muda o contrato de eventos (`src/domain/events.ts`) sem atualizar o hook
e os testes juntos.

## Decisão

Reimplementar **do zero** três ideias, nesta ordem:

1. **Replay do expediente.** Reproduzir o dia a partir de `logs/events.ndjson`, reaproveitando
   a função `replay()` de `src/domain/office.ts`.
2. **Tempo aguardando o humano, por agente.** Calcular a partir dos eventos `agent.started` e
   `agent.finished`, sem ler transcrições.
3. **Retenção do `events.ndjson`.** Manter só os últimos N dias e um limite de tamanho.

## Alternativas descartadas

- **Aprovar permissões pela tela:** quebra o princípio de só ler e exibir eventos. Pode virar
  uma ADR futura.
- **Ler transcrições `.jsonl`:** o OF lê só eventos resumidos, por privacidade.
- **Copiar código do Habblaud:** evita código de terceiros no repositório, e a licença MIT
  exigiria manter o aviso de copyright.
- **Instalar o Habblaud:** ocuparia a porta 4747 (a mesma do OF) e altera a configuração do
  Claude Code.

## Consequências

- O OF continua sem chamar a API do Claude e sem ler transcrições.
- As três ideias entram como código próprio do OF, uma de cada vez, na ordem acima.
