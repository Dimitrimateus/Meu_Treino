import { expect, test } from '@playwright/test';
import { mockSupabase } from './mock';

test('login com senha errada mostra erro claro', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('bia@x.com');
  await page.getByLabel('Senha', { exact: true }).fill('errada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});

test('fluxo do treino: séries com decimal, PR, finalizar e resumo', async ({ page }) => {
  const mock = await mockSupabase(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-mail').fill('bia@x.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-certa');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Olá, Bia' })).toBeVisible();
  await expect(page.getByText('Peito e Tríceps').first()).toBeVisible();
  await page.getByRole('link', { name: 'Começar' }).click();

  await expect(page.getByText('3 × 8–12 · 20 kg · descanso 90 s')).toBeVisible();
  await page.getByRole('link', { name: /Supino reto/ }).click();

  // pré-preenchido pela meta (8 reps, 20 kg)
  await expect(page.getByLabel('Carga da série 1 em kg')).toHaveValue('20');
  await expect(page.getByLabel('Repetições da série 1')).toHaveValue('8');
  await page.getByRole('button', { name: 'Salvar série 1' }).click();
  await expect(page.getByRole('button', { name: 'Série 1 salva' })).toBeVisible();

  // decimal com vírgula → PR de carga
  await page.getByLabel('Carga da série 2 em kg').fill('22,5');
  await page.getByRole('button', { name: 'Salvar série 2' }).click();
  await expect(page.getByTitle(/Recorde pessoal/)).toBeVisible();

  await expect.poll(() => mock.writes.filter((w) => w.table.startsWith('set_logs')).flatMap((w) => w.body as { weight_kg: number }[]).map((r) => r.weight_kg))
    .toContain(22.5);

  // concluir o exercício e finalizar
  await page.getByRole('button', { name: 'Concluir exercício' }).last().click();
  await page.getByRole('link', { name: 'Dia' }).click();
  await page.getByRole('button', { name: 'Finalizar treino' }).click();
  await expect(page.getByText('Duração')).toBeVisible();
  await expect(page.getByText('1/1')).toBeVisible();
  await page.getByRole('button', { name: 'Ver log' }).click();
  await expect(page.getByText('Início (primeiro registro)')).toBeVisible();
  await expect(page.getByText('Treino finalizado')).toBeVisible();

  await expect.poll(() => mock.writes.filter((w) => w.table.startsWith('workout_sessions'))
    .flatMap((w) => w.body as { status: string; duration_seconds: number | null }[]).some((r) => r.status === 'finished' && r.duration_seconds !== null))
    .toBe(true);
});

test('usuária comum não acessa /admin', async ({ page }) => {
  await mockSupabase(page, { role: 'user' });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('bia@x.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-certa');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Bia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/admin/usuarios');
  await expect(page.getByRole('heading', { name: 'Olá, Bia' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
