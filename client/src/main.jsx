import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './router';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <ErrorBoundary>
                <AuthProvider>
                    <SocketProvider>
                        <App />
                        <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 3000,
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
