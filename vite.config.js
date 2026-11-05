import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths make the app work both at the domain root (Render)
  // and inside a repository subpath (GitHub Pages).
  base: './',
  plugins: [react()],
  build: { assetsInlineLimit: 0 },
});
