import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pmtilesCacheHeaders = () => ({
    name: 'pmtiles-cache-headers',
    configureServer(server) {
        server.middlewares.use((request, response, next) => {
            if (request.url?.split('?')[0].endsWith('.pmtiles')) {
                response.setHeader('Cache-Control', 'public, max-age=3600');
            }
            next();
        });
    },
    configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
            if (request.url?.split('?')[0].endsWith('.pmtiles')) {
                response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            }
            next();
        });
    },
});

export default defineConfig({
    plugins: [react(), pmtilesCacheHeaders()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        rolldownOptions: {
            output: {
                // Keep the operational renderer and optional vector-tile stack
                // outside page chunks. These groups are only requested by lazy
                // map routes, so the static landing page never downloads them.
                codeSplitting: {
                    groups: [
                        {
                            name: 'map-renderer',
                            test: /node_modules[\\/]maplibre-gl[\\/]/,
                            priority: 20,
                        },
                        {
                            name: 'map-data',
                            test: /node_modules[\\/](?:pmtiles|@protomaps[\\/]basemaps)[\\/]/,
                            priority: 10,
                        },
                    ],
                },
            },
        },
        // The operational map is intentionally lazy-loaded and remains around
        // 289 kB compressed across the dedicated chunks below.
        chunkSizeWarningLimit: 1100,
    },
});
