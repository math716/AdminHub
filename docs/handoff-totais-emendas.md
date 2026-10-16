# Passagem — totais das emendas federais (16/10/2026)

Arquivo para continuar o trabalho em outra máquina. Apagar quando terminar.

## Regras do usuário (valem sempre)

- Responder em português do Brasil, sem jargão técnico.
- Antes de implementar, apresentar o plano e esperar o "sim".
- Commit e push **só para `origin` (math716)**. `production` (admorbitatech) só quando o usuário pedir, naquela entrega.
- Gravar no banco de produção só com aprovação explícita. Consultas de leitura podem.
- Nunca cortar ou limitar dados para caber no layout; ajustar o layout.

## Contexto

Plano de desempenho do banco aprovado pelo usuário:

1. Gravar em lotes na importação federal.
2. Totais de Emendas pré-calculados (tabela de resumo, atualizada no fim de cada importação).
3. Depois, zerar a tela Query Performance do Supabase ("Reset report") e medir de novo.

### Item 1 — feito (commit `5a389a5c`, só origin)

- `scripts/import-portal-csv.mts` ganhou `--modo lote`: os documentos do lote vão em um único `INSERT ... ON CONFLICT`. O modo `linha` continua como padrão.
- Foi testado num Postgres local com 80 mil linhas de 2023. O resultado é idêntico ao modo linha, exceto em 147 documentos que aparecem repetidos no CSV.
- `import-csv-ano-atual.yml` ganhou o input `modo` (linha | lote).
- **Pendente:** o usuário rodar em Actions → "Import CSV - emendas federais" com `anos=2023` e `modo=lote`, e mandar o log. Se der certo, trocar o padrão do agendamento para `lote`.

### Descoberta que pausou o item 2: os totais das emendas federais estão errados

- O import do CSV grava `valorEmpenhado` e `valorPago` da emenda só quando ela é criada, com os valores da **primeira linha** do arquivo, e nunca mais atualiza.
- Medição no banco real (empenhado gravado × soma dos documentos, em R$ milhões):

  | Ano | Gravado | Soma dos documentos |
  |---|---|---|
  | 2026 | 6.403 | 40.474 |
  | 2025 | 2.368 | 48.092 |
  | 2024 | 31.290 | 44.731 |
  | 2023 | 33.931 | 35.014 |
  | 2022 | 23.526 | 24.939 |
  | 2021 | 29.593 | 31.250 |
  | 2020 | 14 | 2.002 |
  | 2019 | 8 | 204 |

- Uma amostra conferida contra a API oficial mostrou que a **fonte certa é a API** (`/api-de-dados/emendas`), que está atualizada até 2026. A soma dos documentos só se aproxima do valor oficial.
- **Decisão do usuário:** o "pago" da tela deve somar o pago no ano com os restos a pagar pagos. Por isso o script grava `valorPago` = pago + restos pagos, e `valorRestoPago` = só a parte dos restos. Nenhuma tela soma `valorRestoPago` por conta própria, então não há contagem dupla.

### Passo 1 da correção — em andamento

- `scripts/atualizar-totais-emendas-federais.ts` está escrito. Ele lê a API ano a ano (15 emendas por página) e atualiza só as emendas que já existem no banco.
- Uso: `--anos 2025,2026`, `--dry-run` (só mostra o antes e depois) e `--por-minuto 80`.
- O limite oficial da API é 90 consultas por minuto das 6h às 24h. Acima disso ela devolve 403 por alguns minutos; o script espera 1 minuto e tenta de novo.
- A chave válida está em `.env` (`PORTAL_TRANSPARENCIA_API_KEY`). A de `.env.local` é inválida.
- Simulações já feitas, sem gravar (empenhado / pago, em R$ milhões):

  | Ano | Empenhado antes → depois | Pago antes → depois | Emendas a corrigir |
  |---|---|---|---|
  | 2015 | 0 → 528 | 39 → 453 | 339 |
  | 2016 | 4 → 2.177 | 86 → 1.799 | 1.369 |
  | 2017 | 9 → 3.885 | 242 → 3.078 | 1.564 |
  | 2024 | 31.290 → 44.813 | 19.749 → 40.243 | 6.033 |
  | 2025 | 2.368 → 47.086 | 995 → 37.723 | 6.091 |
  | 2026 | 6.403 → 40.237 | 2.576 → 25.912 | 3.299 |

- Falta simular 2018 a 2023. A primeira tentativa levou 403 por excesso de velocidade; isso já foi corrigido no script.
- **Aplicado em 16/10/2026 (com o "sim" do usuário):** passo "Atualizar totais oficiais das emendas" no fim de `import-csv-ano-atual.yml` (anos = `$ANOS`) e de `import-csv-2025.yml` (2025), mais o workflow manual `totais-emendas-federais.yml` (inputs `anos` e `dry_run`, que vem marcado). O banco é acessado pelo GitHub Actions, não pela máquina do trabalho.
- O secret `PORTAL_TRANSPARENCIA_API_KEY` precisa existir no math716 (o usuário cadastra).

## Próximos passos (cada um com o "sim" do usuário)

1. Terminar as simulações de 2018 a 2023 e mostrar ao usuário o quadro completo, antes e depois.
2. Combinar como o script vai rodar (ver acima).
3. Fazer a correção única, gravando de 2015 a 2026. Isso muda os números da tela.
4. Item 2: resumo pré-calculado para `app/api/emendas-portal/resumo/route.ts` (`computeResumoBanco`, que hoje tem cache de 5 min).
   - Ideia: guardar o resultado por (uf, ano, esfera) no fim de cada importação.
   - Na leitura, usar o resumo só se `count(*)` e `max("updatedAt")` de (uf, ano) baterem; senão calcular ao vivo.
   - Comparar resumo × cálculo ao vivo antes de ligar.
5. Depois, à parte, os documentos repetidos no CSV.
   - Em 2023 são 15,5 mil: 5,7 mil são a mesma emenda paga em partes e 9,8 mil são compartilhados entre emendas.
   - Como `codigoDocumento` é único no banco, só uma parte (e uma emenda) fica gravada. Isso afeta só a lista de documentos, não os totais.
