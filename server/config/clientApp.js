import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultClientDistPath = path.resolve(configDirectory, '../../client/dist');

const setStaticCacheHeaders = (res, filePath) => {
    if (path.basename(filePath) === 'sw.js') {
        res.setHeader('Cache-Control', 'no-cache');
        return;
    }
    const assetsSegment = `${path.sep}assets${path.sep}`;
    if (filePath.includes(assetsSegment)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
};

const resolveOptions = ({
    nodeEnv = process.env.NODE_ENV,
    distPath = defaultClientDistPath,
} = {}) => ({ nodeEnv, distPath });

/**
 * Throws when the production client build is missing.
 *
 * Deliberately separate from registration: this is the only part of client
 * hosting that can throw, and it must run inside startServer() so a missing
 * client/dist reaches the normal boot error path ("Failed to start server")
 * instead of surfacing as a raw uncaught exception before crash handlers
 * exist. Registration itself is side-effect free and stays at module scope.
 */
export const assertProductionClientBuild = (options) => {
    const { nodeEnv, distPath } = resolveOptions(options);
    if (nodeEnv !== 'production') return false;
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Production client build is missing: ${indexPath}`);
    }
    return true;
};

/**
 * Registers the static layer and the SPA fallback.
 *
 * MUST be called at module scope in server.js, BEFORE the terminal 404
 * handler. Registering it after that handler silently kills every page
 * load in production: Express matches in registration order and the 404
 * answers first. This function never throws; the build check lives in
 * assertProductionClientBuild().
 */
export const registerProductionClient = (app, options) => {
    const { nodeEnv, distPath } = resolveOptions(options);
    if (nodeEnv !== 'production') return false;

    const indexPath = path.join(distPath, 'index.html');

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

/**
 * Serves the Vite build and handles client-side routes in a combined deployment.
 * API and Socket.IO paths are deliberately excluded from the SPA fallback.
 *
 * Composition kept for callers that want check-and-register in one step. The
 * server itself calls the two halves separately, because they belong on
 * opposite sides of startServer().
 */
export const configureProductionClient = (app, options) => {
    if (!assertProductionClientBuild(options)) return false;
    return registerProductionClient(app, options);
};

export default configureProductionClient;
