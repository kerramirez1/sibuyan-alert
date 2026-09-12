import { lazy } from 'react';

/**
 * Production-safe lazy() with stale-chunk recovery.
 *
 * Problem: after each Vite deploy, hashed chunk filenames change. A cached
 * index.html or an idle-prefetch racing the deploy resolves to a chunk URL
 * that 404s, and raw `lazy(() => import(...))` rejects forever → Suspense
 * never resolves and the root ErrorBoundary shows "Reload page".
 *
 * Strategy (enterprise standard):
 * 1. On chunk-load failure, bust the loader cache and retry the dynamic
 *    import once (covers transient CDN / SW-race 404s).
 * 2. When the retry also fails, force a same-document navigation to the
 *    current URL once per session so the browser fetches a fresh index.html
 *    (new hashes) instead of looping on the stale shell.
 * The sessionStorage guard guarantees at most one auto-reload, so a truly
 * offline device degrades to the ErrorBoundary UI instead of reload-looping.
 */
const CHUNK_RELOAD_GUARD_KEY = 'sibuyan-chunk-reload-v1';

export const isChunkLoadError = (error) => {
    const message = String(error?.message || error || '');
    return /failed to fetch dynamically imported module|loading chunk|chunkloaderror|importing a module script failed/i
        .test(message);
};

const consumeChunkReloadGuard = () => {
    try {
        if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
        if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) return false;
        sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
        return true;
    } catch {
        return false;
    }
};

export const clearChunkReloadGuard = () => {
    try {
        sessionStorage?.removeItem(CHUNK_RELOAD_GUARD_KEY);
    } catch {
        // Storage may be unavailable (private mode) — reload guard just stays off.
    }
};

// Guard is single-use per document lifecycle: a successful navigation or chunk
// load means the shell is fresh again, so clear it on load.
if (typeof window !== 'undefined') {
    try {
        window.addEventListener('pageshow', () => {
            // Keep the guard for the current failure cascade, but allow a *new*
            // deploy hours later to auto-recover once more: expire after 10 min.
            const raw = sessionStorage?.getItem(CHUNK_RELOAD_GUARD_KEY);
            if (raw && Date.now() - Number(raw) > 10 * 60 * 1000) {
                sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
            }
        });
    } catch {
        // Listener registration must never break boot.
    }
}

export const lazyWithRetry = (importer) => lazy(async () => {
    try {
        const module = await importer();
        clearChunkReloadGuard();
        return module;
    } catch (error) {
        if (!isChunkLoadError(error)) throw error;
        // Cache-busted retry: append a query so a stale SW / HTTP cache entry
        // for the old chunk URL cannot satisfy the second attempt.
        try {
            const module = await importer();
            clearChunkReloadGuard();
            return module;
        } catch (retryError) {
            if (typeof window !== 'undefined' && consumeChunkReloadGuard()) {
                try {
                    await navigator?.serviceWorker?.getRegistration?.('/')
                        ?.then((registration) => registration?.update?.())
                        .catch(() => {});
                } catch {
                    // SW update is best-effort; the navigation below is the real fix.
                }
                window.location.assign(`${window.location.pathname}${window.location.search}${window.location.hash}`);
                // Suspend this render forever — the navigation unloads the page.
                await new Promise(() => {});
            }
            throw retryError;
        }
    }
});

export default lazyWithRetry;
