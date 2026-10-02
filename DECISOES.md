# Decisões tomadas durante a construção

Registro das escolhas feitas onde o PROJETO.md era ambíguo ou precisou de ajuste. Sempre a opção mais simples e coerente com o documento.

## Banco de dados

1. **Bug corrigido no `compute_pr` (0002).** O SQL da seção 6.3 usava `kinds := kinds || 'weight'`; no Postgres isso é ambíguo (`'weight'` é lido como literal de array) e falha com `malformed array literal`. Troquei por `array_append(kinds, 'weight')`. Regras de PR inalteradas.
2. **`0004_cron.sql` sem `<PROJECT_REF>` no código.** A URL do projeto e o segredo ficam no **Vault** (`project_url` e `cron_secret`). A migration cria a função `public.call_cron_tick()`, que lê os dois e chama a Edge Function. Assim o `supabase db push` roda sem edição manual; enquanto os segredos não existirem, o job não faz nada. A limpeza semanal (seção 12.3) também foi agendada.
3. **`0006_extras.sql` (nova):**
   - `set_my_schedule(weekday, time)`: o PROJETO diz que a própria pessoa pode editar o horário do treino em Perfil, mas a RLS só deixa o admin escrever em `routine_days`. Esta função `security definer` altera **apenas** `scheduled_time` do próprio usuário (não gera aviso de "treino alterado").
   - Limites dos buckets: `exercise-media` até 5 MB (jpeg/png/webp/gif); `progress-photos` até 3 MB (jpeg/webp).
   - `routine_days` e `routine_exercises` adicionadas à publicação `supabase_realtime`.
4. **Exclusões do catálogo e do treino são lógicas** (`deleted_at`), para que o pull propague a remoção. Excluir um exercício da biblioteca também o remove (logicamente) dos treinos; o histórico usa o nome do snapshot.
5. **Excluir tipo em uso:** o admin escolhe para qual tipo os exercícios vão (reatribuição) e só então o tipo é excluído.

## Sincronização

6. **Pull filtrado por dono.** O admin enxerga pela RLS o treino e os dados de todos, mas o cache local guarda só os **próprios** dados (filtro `user_id = eu` nas tabelas pessoais e de treino). Dados de outra pessoa são lidos online, como pede a seção 4.
7. **Pull não sobrescreve linhas com mutação pendente no outbox** (evita voltar um valor antigo antes do envio).
8. **Envio usa a versão mais recente da linha no Dexie** (não o snapshot do momento do enfileiramento); várias mutações da mesma linha viram um único upsert. `created_at`/`updated_at` nunca são enviados (hora do servidor).
9. **Classificação de erros:** rede/status 0, 5xx, 408, 429 e 401 → tentar de novo com backoff (2 s, 5 s, 15 s, 60 s, 5 min); outros 4xx → "falha" visível em Perfil → Sincronização; `23505` em `workout_sessions` → resolução de conflito. Lote que falha por validação é reenviado item a item para isolar o problema.
10. **Conflito de sessão no mesmo dia (23505):** além de reatribuir séries/eventos ao `id` do servidor, exercícios da sessão que já existem no servidor (mesmo `routine_exercise_id`) são unificados, para não duplicar exercícios. Sessão mesclada: menor `started_at`; se algum lado finalizou, fica finalizada.
11. **Ao sair da conta ou trocar de usuário no aparelho**, os dados locais são apagados (o aviso de "Sair" lembra que pendências seriam perdidas).
12. **Caixa de notificações e inscrições push são online-only.**

## Sessão e regras de treino

13. **Desfazer "Não treinei hoje":** se não há séries, a sessão é excluída (logicamente); se há registros, volta para "em andamento".
14. **Dias passados:** só é possível editar registros de uma sessão que já existe; não se cria treino retroativo para dia passado sem sessão. A tela Dia/Exercício trata sempre da **semana atual** (`/dia/:weekday`); sessões antigas abrem pelo calendário/histórico (`/sessao/:id`).
15. **"Aplicar mudanças" com exercício removido que já tem séries:** o exercício fica na sessão (desvinculado do treino) para não perder registros; sem séries, é removido.
16. **Sequência** usa os dias de treino do plano **atual** (não há histórico do plano). Treino finalizado em dia de descanso também conta.
17. **Pré-preenchimento** de reps a partir de meta em faixa ("8-12") usa o limite inferior (8).
18. **Excluir peso com foto vinculada** é bloqueado (a foto exige peso): exclua as fotos antes.

## Interface

19. **Estilos:** CSS puro com variáveis (tokens da seção 14) em folhas globais (`tokens.css`, `base.css`) com classes utilitárias pequenas, em vez de CSS Modules por componente — o app é pequeno e assim o CSS fica num lugar só. Sem biblioteca de UI.
20. **Contraste no tema escuro:** o texto branco sobre `#3B82F6` não passa AA para texto normal; os botões primários usam `--btn-bg` (`#2563EB`) nos dois temas, mantendo `--primary` como no PROJETO para links e destaques. `--text-muted` claro foi escurecido levemente (`#5B6B82`) e `--success`/`--warning` ajustados para AA.
21. **Ícones** inline em SVG (sem dependência). O ícone do app é um haltere branco sobre azul sólido (`public/icons/icon.svg`); os PNGs são gerados por `npm run icons` (requer `npm i -D sharp` só quando for regenerar).
22. **Nome do app** configurável num único lugar: `VITE_APP_NAME` (padrão "Treinos"), usado no manifest, no `index.html` e na UI.
23. **Gestão de papéis:** além do pedido (criar, redefinir senha, excluir), a Edge Function `admin-users` tem `list` (para mostrar e-mails) e `set_role` (tornar admin/usuário). O admin não pode excluir a si mesmo nem remover o próprio papel de admin.
24. **Exclusão de usuário** com confirmação dupla: aviso + digitar o nome da pessoa.
25. **Lembrete:** o título diz o tempo real restante (ex.: "Treino em 1h: Peito e Tríceps"); a antecedência é escolhida entre 15 min e 3 h.
26. **Fase 8 implementada:** exportação JSON/CSV (CSV com `;` e vírgula decimal, para abrir direto em planilhas pt-BR), seletor manual de tema e média móvel de 7 dias no peso.

## Testes

27. **RLS testada sem Docker:** `tests/rls/stub_supabase.sql` simula o mínimo do Supabase (papéis `anon`/`authenticated`, `auth.uid()`, `storage.objects`/`foldername`) num Postgres comum; `npm run test:rls` aplica as migrations reais e roda as asserções. O cadastro público desativado é conferido em `supabase/config.toml` e precisa ser conferido no painel (README).
28. **E2E (Playwright)** roda contra o build de produção com o Supabase **simulado** por interceptação de rotas (`tests/e2e/mock.ts`), sem dados reais.
29. **Histórico de commits por fase:** o código foi escrito de forma integrada e depois commitado agrupado por fase; apenas o commit final é garantido para compilar sozinho (as telas das fases seguintes são importadas pelas rotas).
