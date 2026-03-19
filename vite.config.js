import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: false  // 禁用 HMR 自动刷新，避免开发时频繁整页重载
  }
});

