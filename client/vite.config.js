import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // React and the animation library change far less often than the
        // app's own code. In their own chunks, their filenames (which are
        // hashes of their contents) stay the same across deploys, so the
        // service worker keeps serving them from cache and a typical update
        // downloads only the small app chunk. recharts needs no entry here:
        // it's already split out by the dynamic import in lib/charts.js.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /[\\/]node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
          ],
        },
      },
    },
  },
})
