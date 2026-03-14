import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0', // Bind to all network interfaces for Docker
    port: 5173,
    strictPort: true,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // minify:false,
    // sourcemap: true, // 🪄 lets you map the error to your original source
    chunkSizeWarningLimit: 700,
    commonjsOptions: {
      defaultIsModuleExports: true
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@radix-ui')) return 'react-ui';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-ui';
          if (id.includes('@tanstack/react-router')) return 'tanstack-router';
          if (id.includes('@tanstack/react-query')) return 'tanstack-query';
          if (id.includes('@tanstack/react-table')) return 'tanstack-table';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('date-fns') || id.includes('react-day-picker')) return 'date';
          if (id.includes('lucide-react')) return 'lucide';
          if (id.includes('country-flag-icons')) return 'flag-icons';
          if (id.includes('zod')) return 'zod';
        },
      },
    },
  },
});
