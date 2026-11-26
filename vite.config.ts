import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: './',
  server: { host: '127.0.0.1', port: 43173 },
  preview: { host: '127.0.0.1', port: 43174 },
  plugins: [
    {
      name: 'shroudkit-production-csp',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          // React Refresh adds an inline preamble and Vite opens a loopback HMR socket.
          return command === 'serve'
            ? html.replace("connect-src 'none'; script-src 'self';",
                "connect-src 'self' ws://127.0.0.1:* ws://localhost:*; script-src 'self' 'unsafe-inline';")
            : html;
        },
      },
    },
    react(),
  ],
}));
