import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ["ethers"],
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Injecté avant chaque <style lang="scss">: les variables de
        // src/styles/_tokens.scss sont disponibles partout sans import
        // manuel dans chaque composant.
        additionalData: `@use "tokens" as *;`,
        loadPaths: ["src/styles"],
      },
    },
  },
})
