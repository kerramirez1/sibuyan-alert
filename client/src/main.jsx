import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <SocketProvider>
                    <App />
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 4000,
                            style: {
                                background: '#1F2937',
                                color: '#F9FAFB',
                                borderRadius: '12px',
                                padding: '16px',
                            },
                            success: {
                                iconTheme: {
                                    primary: '#10B981',
                                    secondary: '#F9FAFB',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#EF4444',
                                    secondary: '#F9FAFB',
                                },
                            },
                        }}
                    />
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
