import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://<user>.github.io/flipping-note/
export default defineConfig({
  plugins: [react()],
  base: '/flipping-note/',
})
