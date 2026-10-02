import { defineConfig } from '@playwright/test';

// E2E com Supabase simulado (rotas interceptadas em tests/e2e/mock.ts).
// Uso: npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Recife',
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
