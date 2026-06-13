import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({ registerType: 'autoUpdate' })
  ],
  // Note: Set this to your GitHub repo name for GH Pages compatibility
  base: '/sticker-slicer/' 
})