import { Link } from '../router';
import { HiOutlineHome, HiOutlineArrowLeft } from 'react-icons/hi';
import Button from '../components/ui/Button';

const NotFoundPage = () => (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-[var(--bg-primary)] px-5 py-12 text-[var(--text-primary)]">
        <div className="w-full max-w-xl">
            <Link to="/" className="mb-10 inline-flex items-center gap-2 font-display text-lg font-semibold" aria-label="Sibuyan Alert home">
                <img src="/icons/Alert.png" alt="" className="h-8 w-8 object-contain" />
                <span>Sibuyan <span className="text-red-600 dark:text-red-400">Alert</span></span>
            </Link>
            <p className="page-eyebrow">Page unavailable</p>
            <p className="mb-4 font-display text-7xl font-semibold leading-none tracking-tight text-[var(--accent-text)]">404</p>
            <h1 className="page-title">Page not found</h1>
            <p className="page-description mt-3">
                The page you&apos;re looking for doesn&apos;t exist or has been moved to a different location.
            </p>
            <div className="mt-7 flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row">
                <Button as={Link} to="/" icon={HiOutlineHome}>Go Home</Button>
                <Button variant="outline" icon={HiOutlineArrowLeft} onClick={() => window.history.back()}>Go Back</Button>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-[var(--text-secondary)]">Return home or go back to continue using Sibuyan Alert.</p>
        </div>
    </main>
);

export default NotFoundPage;
