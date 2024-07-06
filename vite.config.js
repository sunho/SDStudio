import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import plainText from 'vite-plugin-plain-text';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), plainText()],
})
