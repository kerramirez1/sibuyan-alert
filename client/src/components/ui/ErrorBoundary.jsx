import { Component } from 'react';
import { HiOutlineExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';
import { clearChunkReloadGuard, isChunkLoadError } from '../../utils/lazyWithRetry';

const CHUNK_GUARD_KEY = 'sibuyan-chunk-reload-v1';

const consumeReloadGuard = () => {
    try {
        if (typeof sessionStorage === 'undefined') return false;
        if (sessionStorage.getItem(CHUNK_GUARD_KEY)) return false;
        sessionStorage.setItem(CHUNK_GUARD_KEY, String(Date.now()));
        return true;
    } catch {
        return false;
    }
};

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, isChunkError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error, isChunkError: isChunkLoadError(error) };
    }

    componentDidCatch(error, errorInfo) {
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        } else {
            console.error('ErrorBoundary caught an error:', error, errorInfo);
        }

        // Stale-deploy chunk 404: the cached shell references deleted hashes.
        // Auto-recover once per session by reloading to the fresh index.html.
        // The guard prevents reload loops when truly offline.
        if (isChunkLoadError(error) && typeof window !== 'undefined' && consumeReloadGuard()) {
            try {
                navigator?.serviceWorker?.getRegistration?.('/')
                    ?.then((registration) => registration?.update?.())
                    .catch(() => {});
            } catch {
                // Best-effort only.
            }
            window.location.reload();
        }
    }

    componentDidUpdate(prevProps) {
        // Route changes invalidate a previous render error (e.g. bad record id).
        if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
            clearChunkReloadGuard();
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({ hasError: false, error: null, isChunkError: false });
        }
    }

    handleReload = () => {
        window.location.reload();
    };

    handleRetry = () => {
        clearChunkReloadGuard();
        if (typeof this.props.onReset === 'function') {
            try {
                this.props.onReset();
            } catch {
                // Reset callback must never throw out of the boundary.
            }
        }
        this.setState({ hasError: false, error: null, isChunkError: false });
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { title = 'Something went wrong', message = 'An unexpected error occurred while rendering this page.' } = this.props;

        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
                <div className="w-full max-w-md text-center">
                    <div className="flex justify-center">
                        <HiOutlineExclamationCircle className="h-16 w-16 text-red-500" aria-hidden="true" />
                    </div>
                    <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {this.state.isChunkError
                            ? 'A new version was published. Reload to get the latest files.'
                            : message}
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-2">
                        {!this.state.isChunkError && (
                            <button
                                type="button"
                                onClick={this.handleRetry}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                            >
                                Try again
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                        >
                            <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                            Reload page
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
