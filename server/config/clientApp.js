import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultClientDistPath = path.resolve(configDirectory, '../../client/dist');

const setStaticCacheHeaders = (res, filePath) => {
    const assetsSegment = `${path.sep}assets${path.sep}`;
    if (filePath.includes(assetsSegment)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
};

/**
 * Serves the Vite build and handles client-side routes in a combined deployment.
 * API and Socket.IO paths are deliberately excluded from the SPA fallback.
 */
export const configureProductionClient = (
    app,
    { nodeEnv = process.env.NODE_ENV, distPath = defaultClientDistPath } = {}
) => {
    if (nodeEnv !== 'production') return false;

    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Production client build is missing: ${indexPath}`);
    }

    app.use(express.static(distPath, {
        dotfiles: 'deny',
        fallthrough: true,
        index: false,
        setHeaders: setStaticCacheHeaders,
    }));

    app.get('*', (req, res, next) => {
        if (
            req.path === '/api'
            || req.path.startsWith('/api/')
            || req.path === '/socket.io'
            || req.path.startsWith('/socket.io/')
            || !req.accepts('html')
        ) {
            return next();
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.sendFile(indexPath, (error) => {
            if (error) next(error);
        });
    });

    return true;
};

export default configureProductionClient;
