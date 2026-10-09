import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, strictPort: true,
    // Le serveur de développement ne doit servir ni les réponses privées ni SQLite.
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/backend/**'], allow: [
      fileURLToPath(new URL('./', import.meta.url)),
      fileURLToPath(new URL('../node_modules/', import.meta.url)),
    ] },
  },
});
