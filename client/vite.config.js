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
    },
});
