import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appName = env.VITE_APP_NAME || 'Treinos';
  process.env.VITE_APP_NAME = appName; // usado no index.html (%VITE_APP_NAME%)
  return {
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        },
        devOptions: { enabled: false, type: 'module' },
        manifest: {
          name: appName,
          short_name: appName,
          description: 'Acompanhamento de treinos de musculação',
          lang: 'pt-BR',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          theme_color: '#2563EB',
          background_color: '#F8FAFC',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            dexie: ['dexie', 'dexie-react-hooks'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.ts'],
    },
  };
});
