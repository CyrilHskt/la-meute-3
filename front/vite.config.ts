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
        // Injected before every <style lang="scss">: the variables from
        // src/styles/_tokens.scss are available everywhere without a
        // manual import in each component.
        additionalData: `@use "tokens" as *;`,
        loadPaths: ["src/styles"],
      },
    },
  },
})
