import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './router';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { registerServiceWorker } from './services/serviceWorker';
import './index.css';

// Registered eagerly, not only when a user enables push: the worker also
// serves the offline app shell. Fire-and-forget so it can never block boot.
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
    // Fail-visible instead of throwing outside React (which no ErrorBoundary
    // can catch): a corrupt index.html serve becomes an actionable message.
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:24px;text-align:center"><div><h1 style="font-size:20px;font-weight:700">Application shell failed to load</h1><p style="margin-top:8px;color:#6b7280">The page markup is incomplete. Reload to fetch a fresh copy.</p><button type="button" onclick="window.location.reload()" style="margin-top:16px;padding:10px 20px;border-radius:8px;background:#0e5f46;color:#fff;border:0;cursor:pointer">Reload page</button></div></div>';
    throw new Error('Application root element (#root) is missing');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <BrowserRouter>
            <ErrorBoundary>
                <AuthProvider>
                    <SocketProvider>
                        <App />
                        <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 2500,
                            className: 'app-toast',
                            style: {
                                background: 'var(--surface-elevated)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: 'var(--shadow-lg)',
                            },
                            success: {
                                iconTheme: {
                                    primary: '#10B981',
                                    secondary: 'var(--surface-elevated)',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#EF4444',
                                    secondary: 'var(--surface-elevated)',
                                },
                            },
                        }}
                    />
                </SocketProvider>
            </AuthProvider>
        </ErrorBoundary>
        </BrowserRouter>
    </React.StrictMode>
);
