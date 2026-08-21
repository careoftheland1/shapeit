import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.glb'],
  optimizeDeps: { exclude: ['three'] },
  plugins: [react()],
})
