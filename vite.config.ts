import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // important for Electron to load files correctly
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
