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
    // Eager react+radix core (~1MB) is irreducible; raise the limit past it so it
    // stops false-alarming. The lazy 'react-pdf' chunk (~1.5MB) stays above this line
    // on purpose — it's an on-demand vendor, and a warning surfaces it if it ever
    // accidentally gets pulled into an eager chunk.
    chunkSizeWarningLimit: 1100,
    commonjsOptions: {
      defaultIsModuleExports: true
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // react-pdf (+ its yoga/fontkit deps) is a ~1.5MB lib reached only by the
          // on-demand PDF path (2 importers). Isolate it into one shared lazy chunk so
          // it never duplicates across those importers and caches apart from app code.
          if (id.includes('@react-pdf') || id.includes('/yoga-layout') || id.includes('fontkit')) return 'react-pdf';
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
