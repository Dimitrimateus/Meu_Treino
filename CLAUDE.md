# App de Treinos (PWA) — resumo para o Claude Code

Especificação completa, já decidida com o dono do projeto: @PROJETO.md
Leia o PROJETO.md inteiro antes de codar. Em caso de conflito, o PROJETO.md vale.

## O que é
PWA de treinos para 2 pessoas (admin = Dimitri; user = namorada, iPhone). Web + instalável, sincronizado entre PC e celular, funciona offline. Tudo em **pt-BR**.

## Stack
React 18 + TypeScript + Vite · React Router · Dexie (IndexedDB, local-first) · Supabase (Auth, Postgres+RLS, Storage, Realtime, Edge Functions, pg_cron) · Chart.js (lazy) · vite-plugin-pwa (`injectManifest`) · Vitest · Cloudflare Pages.

## Regras que não podem ser quebradas
- Construir o projeto **inteiro de uma vez**, seguindo as fases do PROJETO.md (seção 16) como ordem de trabalho; um commit por fase; sem pedir confirmação entre fases.
- Decidir sozinho em caso de ambiguidade (escolher o mais simples) e registrar em `DECISOES.md`. Sinalizar ressalvas só no final.
- **Nunca** colocar chaves secretas no front ou no repositório. Só a `anon key`. `service_role` só nas Edge Functions.
- Segurança via **RLS** (seções 6 e 7). Cadastro público desativado; admin cria contas via Edge Function `admin-users`.
- Editor do admin é **online-only**; dados da pessoa (sessões, séries, peso, fotos) são **local-first** com outbox idempotente (UUID no cliente, exclusão lógica `deleted_at`).
- Sem vídeo, sem timer de descanso (descanso é só informativo), sem mais de um treino por dia.
- Peso em kg com **decimais** (aceitar vírgula e ponto; exibir com vírgula).
- Foto de evolução **exige** um peso. Admin vê tudo; não avisar a usuária disso.
- Duração do treino = `finished_at − started_at` (1º check/1ª série). Gravar log de eventos.
- Push: lembrete 1 h antes do treino e aviso agrupado de treino alterado. iOS ≥ 16.4 e só com app na Tela de Início; pedir permissão por gesto; sempre chamar `showNotification` no evento `push`.
- Visual: **azul como base, cores sólidas, sem gradientes**, tema claro/escuro, mobile-first, alvos de toque ≥ 44 px, inputs ≥ 16 px.

## Comandos (criar no package.json)
- `npm run dev` · `npm run build` · `npm run test` · `npm run lint`
- Supabase: `supabase db push` · `supabase functions deploy <nome>`

## Ao terminar
Rodar testes e build, conferir o checklist da seção 21 do PROJETO.md e entregar o `README.md` com o passo a passo de publicação (seção 18).
