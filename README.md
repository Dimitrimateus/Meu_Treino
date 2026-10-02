# Treinos — PWA de acompanhamento de treinos

App de musculação para poucas pessoas (admin + usuária), em pt-BR. Funciona no navegador e instalado (PWA, inclusive iPhone), sincroniza entre aparelhos via Supabase e funciona sem internet na academia.

- Especificação: [`PROJETO.md`](PROJETO.md) · Decisões tomadas: [`DECISOES.md`](DECISOES.md)
- Stack: React 18 + TypeScript + Vite · React Router · Dexie (IndexedDB, local-first) · Supabase (Auth, Postgres + RLS, Storage, Realtime, Edge Functions, pg_cron) · Chart.js (sob demanda) · vite-plugin-pwa (`injectManifest`) · Vitest · Playwright.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências |
| `npm run dev` | servidor local (precisa de `.env`) |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run preview` | serve o build |
| `npm run test` | testes unitários (Vitest) |
| `npm run test:rls` | testes de RLS/Storage/triggers num Postgres local (veja abaixo) |
| `npm run test:e2e` | E2E com Playwright e Supabase simulado |
| `npm run lint` | ESLint + typecheck |

Configuração local: `cp .env.example .env` e preencha as variáveis (seção 20 do PROJETO).

---

## Publicação passo a passo

> Tudo aqui é feito por você (exige suas contas/credenciais). Nenhuma chave secreta vai para o repositório: o front só recebe a **anon key**, que é pública e protegida pela RLS.

### A. Supabase

1. Crie uma conta e um projeto em [supabase.com](https://supabase.com) (plano gratuito). Em **Project Settings → API**, guarde a **Project URL** e a **anon key**. Anote também o **Project Ref** (o código na URL `https://<PROJECT_REF>.supabase.co`).
2. **Authentication → Sign In / Providers**: desmarque **"Allow new users to sign up"** (cadastro público desativado). Em **Authentication → Policies / Password**, defina senha mínima de **8** caracteres.
3. Instale e conecte a CLI:
   ```bash
   npm i -g supabase        # ou use npx supabase …
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```
4. Aplique as migrations (esquema, triggers, RLS, Storage, cron, tipos iniciais, extras):
   ```bash
   supabase db push
   ```
   > Se o `db push` reclamar de `pg_cron`/`pg_net`, ative as extensões em **Database → Extensions** e rode de novo.
5. Gere as chaves VAPID (Web Push):
   ```bash
   npx web-push generate-vapid-keys
   ```
6. Defina os secrets das Edge Functions (troque os valores; o `CRON_SECRET` deve ser um texto aleatório longo, ex.: `openssl rand -hex 32`):
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:seu@email CRON_SECRET=<valor-aleatorio-longo>
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase.)
7. Publique as funções:
   ```bash
   supabase functions deploy admin-users
   supabase functions deploy cron-tick --no-verify-jwt
   ```
8. No **SQL Editor**, crie os dois segredos usados pelo agendamento (uma vez só):
   ```sql
   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
   select vault.create_secret('<MESMO VALOR DO CRON_SECRET>', 'cron_secret');
   ```
   O job `tick-every-minute` já foi criado pela migration `0004_cron.sql` e passa a funcionar assim que os segredos existirem. Para conferir: `select * from cron.job;` e, depois de alguns minutos, `select * from cron.job_run_details order by start_time desc limit 5;`.
9. **Crie o primeiro admin:** **Authentication → Users → Add user** (e-mail + senha, marque *Auto Confirm User*). Depois, no SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where id = '<UUID do usuário>';
   ```
10. Em **Storage**, confira que existem os buckets `progress-photos` (privado) e `exercise-media` (público).

### B. Cloudflare Pages

1. Suba o código para um repositório no GitHub.
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → escolha o repositório.
3. Build command: `npm run build` · Build output directory: `dist` · (Framework preset: *None* ou *Vite*.)
4. Variáveis de ambiente (Production e Preview):
   - `VITE_SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key
   - `VITE_VAPID_PUBLIC_KEY` = chave **pública** VAPID
   - `VITE_APP_NAME` = `Treinos` (opcional)
   - `NODE_VERSION` = `22`
5. Deploy. O arquivo `public/_redirects` (`/* /index.html 200`) faz o fallback de SPA.

*Alternativa — GitHub Pages:* use uma Action que rode `npm ci && npm run build` com as mesmas variáveis e publique `dist/`; como o GitHub Pages não lê `_redirects`, copie `dist/index.html` para `dist/404.html` no build. O app precisa ser servido na raiz do domínio (`scope: "/"`).

### C. Primeiro uso

1. O admin entra, cria os **tipos** (já vêm alguns), os **exercícios** (descrição + fotos/GIFs) e monta a **semana** em Admin → Editor de treino.
2. O admin cria a conta da usuária em **Admin → Usuários** e envia e-mail/senha.
3. A usuária abre o link no **Safari** do iPhone → **Compartilhar → Adicionar à Tela de Início** → abre pelo ícone → **Perfil → Ativar lembretes**.

---

## Testes

**Unitários** (`npm run test`): números pt-BR, datas/fuso (`America/Recife` perto da meia-noite UTC), duração, PR/Epley, sequência, outbox (ordem, backoff, 4xx vira falha, idempotência), conflito de sessão duplicada (23505) e a janela do lembrete do `cron-tick`.

**RLS** (`npm run test:rls`): aplica as migrations reais num Postgres local (sem Docker), com um *stub* mínimo do Supabase (`tests/rls/stub_supabase.sql`), e verifica: usuária não lê dados de outra, não altera o próprio papel, não escreve em `routine_*`/`exercises`/`exercise_types`; admin lê sessões/peso/fotos de todos e escreve no treino; Storage (fotos por pasta, admin lê todas, só admin grava em `exercise-media`); triggers (perfil + 7 dias de descanso, PR, aviso de alteração). Requer `psql` e um Postgres acessível (`PGHOST`, `PGUSER`… ou, como root, o usuário `postgres` local).

**E2E** (`npm run test:e2e`): login (erro claro), abrir o treino do dia, registrar séries com decimal (`22,5`), PR, concluir, finalizar, ver duração e log; usuária sem acesso ao `/admin`. O Supabase é simulado por interceptação de rotas. Se o Playwright não achar o Chromium, aponte `PW_CHROMIUM_PATH` para o executável.

### Roteiro manual (com o Supabase real)

1. **Instalação no iPhone** (iOS ≥ 16.4): Safari → Compartilhar → Adicionar à Tela de Início; abrir pelo ícone; o app abre em tela cheia.
2. **Modo avião:** com o app aberto, ative o modo avião, registre séries e conclua um exercício (o topo mostra "⚠ Offline · N"); desative o modo avião e volte ao app → "✓ Sincronizado"; confira no PC.
3. **Lembrete:** em Perfil, ative lembretes e ajuste o horário de hoje para daqui ~65 min (antecedência 60) → a notificação chega por volta de 1 h antes.
4. **Treino alterado:** o admin altera o treino da usuária e salva → cerca de 2 min depois chega **um** aviso "Seu treino foi atualizado por …". Se ela estiver treinando, aparece "Aplicar mudanças?".
5. **Foto com peso:** Peso → Fotos → Adicionar foto: só salva com peso; o admin vê a foto em Peso → Ver: (pessoa).
6. **Cadastro desativado:** em Authentication confirme que "Allow new users to sign up" está desligado.

## Limites conhecidos

- **Push no iPhone** só com o app na Tela de Início e iOS 16.4+; o iOS pode atrasar a entrega (o lembrete é "aproximadamente" 1 h antes). A caixa de notificações em Perfil serve de reserva.
- O iOS pode limpar dados de sites **não instalados** após ~7 dias sem uso: instale o app. O app pede `navigator.storage.persist()`.
- **Plano gratuito do Supabase:** o projeto pode ser pausado após inatividade; há limites de armazenamento (~1 GB de arquivos) e sem backups garantidos — use **Admin → Exportar dados** de vez em quando. Confira os limites atuais na documentação do Supabase.
- `cron-tick` roda a cada minuto (~43 mil chamadas/mês); se precisar reduzir, troque para `*/5 * * * *` em `cron.schedule` (a janela do lembrete e a deduplicação continuam valendo).

## Estrutura

```
src/
  lib/            db (Dexie), sync/ (engine, outbox, pull, conflict, realtime), data/ (ações e consultas),
                  pr, streak, numbers, dates, image, push, pwa, progress
  features/       auth, week, day, exercise, session, progress, weight, photos, profile, admin
  components/     Modal, Toast, Badge, NumberInput, SyncStatus, Chart, Calendar, PersonPicker…
  sw.ts           service worker (precache, push, clique, cache de mídia)
supabase/
  migrations/     0001 esquema · 0002 triggers · 0003 RLS/Storage · 0004 cron · 0005 tipos · 0006 extras
  functions/      admin-users · cron-tick · _shared (push, cors, horário)
tests/            unit/ · rls/ · e2e/
```
