import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './router';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
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
