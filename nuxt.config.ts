export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@comark/nuxt',
    '@nuxthub/core',
    'nuxt-auth-utils',
    'nuxt-charts',
    'nuxt-csurf'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    supabase: {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_KEY
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY
    },
    zaloBotToken: process.env.ZALO_BOT_TOKEN,
    tavilyApiKey: process.env.TAVILY_API_KEY
  },

  sourcemap: {
    server: false,
    client: false
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    preset: 'cloudflare-pages',
    minify: true,
    experimental: {
      openAPI: true
    },
    externals: {
      inline: ['vue', '@vue/runtime-core', '@vue/shared', 'consola']
    }
  },

  hub: {
    db: 'sqlite',
    blob: true
  },

  vite: {
    optimizeDeps: {
      include: ['striptags']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
