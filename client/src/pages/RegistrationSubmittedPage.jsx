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
    // ordinary (pending) and reporter both land here; /my-reports is reporter-only,
    // so route ordinary users to /profile where verification status + resubmit live.
    // Unauthenticated visits (refresh before session restore) fall back to /login.
    const accountTarget = accountTargetOverride
        || (user?.role === 'reporter' ? '/my-reports' : null)
        || (user ? '/profile' : '/login');
    return (
    <main className="w-full py-4" aria-labelledby="registration-submitted-title">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <HiOutlineCheck className="h-8 w-8" aria-hidden="true" />
            </span>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Submission received</p>
            <h1 id="registration-submitted-title" className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                Account submitted for review
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600">
                Your municipal administrator will manually compare your ID and selfie before reporter access is approved.
            </p>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <HiOutlineClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Review status</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Check your account for approval or feedback from your municipality.</p>
                    </div>
                </div>
                <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <HiOutlineClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Report access</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Incident submission becomes available after verification.</p>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left">
                <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                <p className="text-xs leading-5 text-gray-700">Your verification photos remain private and are not displayed on public incident reports.</p>
            </div>

            <Link to={accountTarget} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                Go to my account
            </Link>
            {!isAuthenticated && (
                <p className="mt-3 text-xs text-gray-500">
                    Already verified? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link> to continue.
                </p>
            )}
        </div>
    </main>
    );
};

export default RegistrationSubmittedPage;
