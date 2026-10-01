import {
    HiOutlineMap,
    HiOutlineLightningBolt,
    HiOutlineUserGroup,
    HiOutlineShieldCheck,
} from 'react-icons/hi';

const features = [
    {
        Icon: HiOutlineMap,
        title: 'Operational Map',
        desc: 'Published incidents and active high-risk zones in map and 3D views.',
    },
    {
        Icon: HiOutlineLightningBolt,
        title: 'Responder Alerts',
        desc: 'Updates for municipal response units after verification or transfer.',
    },
    {
        Icon: HiOutlineUserGroup,
        title: 'Role-based Workflow',
        desc: 'Residents report, administrators review, and responders act.',
    },
    {
        Icon: HiOutlineShieldCheck,
        title: 'Administrator Review',
        desc: 'Pending reports stay off the public map until verified.',
    },
];

const reporterEnrollmentStages = [
    'Create your account',
    'Submit your government ID',
    'Complete selfie verification',
    'Wait for municipal approval',
    'Start reporting incidents',
];

const municipalitySeals = [
    {
        name: 'Cajidiocan',
        src: '/icons/Cajidiocan.logo.png',
        imageClass: 'scale-[1.8]',
    },
    {
        name: 'Magdiwang',
        src: '/icons/Magdiwang.logo.png',
        imageClass: 'scale-[1.55]',
    },
    {
        name: 'San Fernando',
        src: '/icons/Sanfernando.logo.png',
        imageClass: 'scale-[0.86]',
    },
];

const MunicipalitySeals = () => (
    <div className="flex shrink-0 items-center gap-2" aria-label="Municipality seals">
        {municipalitySeals.map(({ name, src, imageClass }) => (
            <span key={name} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white/10 p-0.5" title={name}>
                <img src={src} alt={`${name} seal`} className={`h-full w-full object-contain ${imageClass}`} />
            </span>
        ))}
    </div>
);

const MunicipalityCoverage = ({ compact = false }) => compact ? (
    <div className="mt-6 border-t border-white/10 pt-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white">Coverage across 3 municipalities</p>
        <div className="mt-2.5">
            <MunicipalitySeals />
        </div>
        <p className="mt-2.5 text-xs font-medium text-sky-300">
            Cajidiocan, Magdiwang, San Fernando
        </p>
    </div>
) : (
    <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-6">
        <MunicipalitySeals />
        <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white">Coverage across 3 municipalities</p>
            <p className="mt-0.5 text-xs font-medium text-sky-300">
                Cajidiocan, Magdiwang, San Fernando
            </p>
        </div>
    </div>
);

const AuthLayout = ({ children, variant = 'login' }) => {
    const isRegistrationPortal = variant === 'registration';
    const isLoginPortal = variant === 'login' || !isRegistrationPortal;
    const isFocusedPortal = isLoginPortal || isRegistrationPortal;

    return (
        <div className="auth-shell min-h-dvh bg-[var(--bg-primary)] font-sans text-[var(--text-primary)] lg:grid lg:grid-cols-[minmax(370px,38%)_minmax(0,1fr)]">
            <a href="#main-content" className="skip-link">Skip to content</a>
            {/* ── Left Branding & Overview Panel ── */}
            <aside
                className={`auth-overview relative hidden min-h-dvh border-r border-brand-900/60 bg-brand-950 text-white lg:flex lg:flex-col ${isRegistrationPortal ? 'lg:sticky lg:top-0 lg:h-dvh lg:self-start lg:overflow-y-auto' : ''}`}
                aria-label={isRegistrationPortal ? 'Sibuyan Alert reporter registration overview' : 'Sibuyan Alert system overview'}
            >
                <div className={`relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-between px-8 py-6 xl:px-12 xl:py-8 ${isFocusedPortal ? '' : 'justify-center'}`}>
                    {/* Brand Lockup — unified wordmark: the logo IS the letter S,
                        sharing one flex line with "ibuyan Alert" and sized in em so
                        the visible S glyph matches the text cap height. */}
                    <div className="min-w-0">
                        <span className="sr-only">Sibuyan Alert</span>
                        <p aria-hidden="true" className="flex items-center font-display text-xl font-bold leading-none tracking-tight">
                            <img
                                src="/icons/Alert.png"
                                alt=""
                                className="h-[1.3em] w-[1.3em] shrink-0 object-contain"
                            />
                            <span className="-ml-[0.08em]">
                                ibuyan <span className="text-red-400">Alert</span>
                            </span>
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Accident Alert &amp; Mapping System
                        </p>
                    </div>

                    {/* Headline & Description */}
                    <section className={isFocusedPortal ? 'mt-10 py-4' : 'my-8'}>
                        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-sky-300">
                            Sibuyan Island incident coordination
                        </p>
                        {isRegistrationPortal ? (
                            <>
                                <h2 className="max-w-md font-display text-2xl font-semibold leading-snug tracking-tight text-white xl:text-3xl">
                                    Become a verified reporter.
                                </h2>
                                <p className="mt-3 max-w-md text-xs sm:text-sm leading-relaxed text-brand-200/80">
                                    Create your account and complete identity verification before incident reporting is enabled.
                                </p>
                                <ol className="mt-6 space-y-3.5" aria-label="Reporter enrollment process">
                                    {reporterEnrollmentStages.map((stage, index) => (
                                        <li key={stage} className="flex items-center gap-3.5">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-sky-300 ring-1 ring-sky-400/30">
                                                {index + 1}
                                            </span>
                                            <span className="text-xs sm:text-sm font-medium text-brand-200/90">{stage}</span>
                                        </li>
                                    ))}
                                </ol>
                            </>
                        ) : (
                            <>
                                <h2 className="max-w-md font-display text-2xl font-semibold leading-snug tracking-tight text-white xl:text-3xl">
                                    Report, review, map, and coordinate accident response in one system.
                                </h2>
                                <p className="mt-3 max-w-md text-xs sm:text-sm leading-relaxed text-brand-200/80">
                                    Built for residents, municipal administrators, and emergency response units across Sibuyan Island.
                                </p>
                            </>
                        )}
                    </section>

                    {!isFocusedPortal && (
                        <div className="my-6 grid grid-cols-2 border-y border-white/10">
                            {features.map(({ Icon, title, desc }, index) => (
                                <div
                                    key={title}
                                    className={`py-4 ${index % 2 === 0 ? 'border-r border-white/10 pr-4' : 'pl-4'} ${index < 2 ? 'border-b border-white/10' : ''}`}
                                >
                                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sky-300">
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <h2 className="text-xs font-bold text-white">{title}</h2>
                                    <p className="mt-1 text-[11px] leading-relaxed text-brand-200/70">{desc}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Coverage & System Footer — pinned to the panel bottom so the
                        gap between the brand and the headline stays fixed
                        instead of stretching on tall viewports. */}
                    <div className="mt-auto">
                        <MunicipalityCoverage compact={isFocusedPortal} />
                        <p className="mt-4 text-[11px] text-brand-200/80">
                            © 2026 Sibuyan Alert System
                        </p>
                    </div>
                </div>
            </aside>

            {/* ── Right Content Panel ── */}
            <main id="main-content" tabIndex={-1} className="auth-content relative flex min-h-dvh w-full min-w-0 items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
                <div className={`w-full ${isRegistrationPortal ? 'max-w-[640px]' : 'max-w-[420px]'}`}>
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AuthLayout;
