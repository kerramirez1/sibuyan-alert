import { Component } from 'react';
import { HiOutlineExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        } else {
            console.error('ErrorBoundary caught an error:', error, errorInfo);
        }
    }

    handleReload = () => {
        window.location.reload();
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
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                        <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                        Reload page
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
