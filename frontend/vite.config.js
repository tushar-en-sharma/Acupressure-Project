import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// three.js is a lazy chunk (loaded only for the 3D body picker), so it is excluded from the size warning.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
})
