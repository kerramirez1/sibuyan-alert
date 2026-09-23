import { Link } from '../router';
import { useAuth } from '../context/AuthContext';
import {
    HiOutlineCheck,
    HiOutlineClipboardCheck,
    HiOutlineClock,
    HiOutlineShieldCheck,
} from 'react-icons/hi';

const RegistrationSubmittedPage = (props = {}) => {
    const { isAuthenticated, user } = useAuth();
    const accountTargetOverride = props?.accountTargetOverride;
    // Reporter identity is retained while approval is pending. Keep the existing
    // role destination; the separate profile link opens verification information.
    // Unauthenticated visits (refresh before session restore) fall back to /login.
    const accountTarget = accountTargetOverride
        || (user?.role === 'reporter' ? '/my-reports' : null)
        || (user ? '/profile' : '/login');
    return (
    <section className="w-full py-4" aria-labelledby="registration-submitted-title">
        <div className="form-surface text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)]">
                <HiOutlineCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="page-eyebrow mt-5">Submission received</p>
            <h1 id="registration-submitted-title" className="page-title mt-2">
                Account submitted for review
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600">
                Your municipal administrator will manually compare your ID and selfie before reporter access is approved.
            </p>

            <div className="mt-6 grid gap-5 border-y border-[var(--border)] py-5 text-left sm:grid-cols-2">
                <div className="flex gap-3">
                    <HiOutlineClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Review status</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Check your account for approval or feedback from your municipality.</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <HiOutlineClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Report access</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Incident submission becomes available after verification.</p>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-lg bg-[var(--surface-muted)] p-4 text-left">
                <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                <p className="text-xs leading-5 text-gray-700">Your verification photos remain private and are not displayed on public incident reports.</p>
            </div>

            <Link to={accountTarget} className="btn-primary mt-6 w-full">
                Go to my account
            </Link>
            {isAuthenticated && user?.role === 'reporter' && (
                <Link to="/profile" className="text-action mt-3">View verification status</Link>
            )}
            {!isAuthenticated && (
                <p className="mt-3 text-xs text-gray-500">
                    Already verified? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link> to continue.
                </p>
            )}
        </div>
    </section>
    );
};

export default RegistrationSubmittedPage;
