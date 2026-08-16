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
            <span key={name} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-800/40 bg-white/10 p-0.5" title={name}>
                <img src={src} alt={`${name} seal`} className={`h-full w-full object-contain grayscale opacity-80 ${imageClass}`} />
            </span>
        ))}
    </div>
);

const MunicipalityCoverage = ({ compact = false }) => compact ? (
    <div className="mt-8 border-t border-emerald-900/40 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white">Coverage across 3 municipalities</p>
        <div className="mt-2.5">
            <MunicipalitySeals />
        </div>
        <p className="mt-2.5 text-xs font-medium text-emerald-400">
            Cajidiocan, Magdiwang, San Fernando
        </p>
    </div>
) : (
    <div className="mt-8 flex items-center gap-4 border-t border-emerald-900/40 pt-6">
        <MunicipalitySeals />
        <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white">Coverage across 3 municipalities</p>
            <p className="mt-0.5 text-xs font-medium text-emerald-400">
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
        <div className="auth-shell min-h-dvh bg-gray-50/70 font-sans text-gray-900 selection:bg-brand-200 selection:text-brand-900 dark:bg-[#07130e] dark:text-gray-100 lg:grid lg:grid-cols-[minmax(370px,38%)_minmax(0,1fr)]">
            {/* ── Left Branding & Overview Panel ── */}
            <aside
                className={`auth-overview relative hidden min-h-dvh border-r border-brand-900/60 bg-brand-950 text-white lg:flex lg:flex-col ${isRegistrationPortal ? 'lg:sticky lg:top-0 lg:h-dvh lg:self-start lg:overflow-y-auto' : ''}`}
                aria-label={isRegistrationPortal ? 'Sibuyan Alert reporter registration overview' : 'Sibuyan Alert system overview'}
            >
                {/* Subtle low-contrast background grid texture */}
                <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:100%_4px]" aria-hidden="true" />

                <div className={`relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-between px-8 py-10 xl:px-12 ${isFocusedPortal ? '' : 'justify-center'}`}>
                    {/* Brand Lockup */}
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-white/20 shadow-xs">
                                <img
                                    src="/icons/Alert.png"
                                    alt=""
                                    className="h-full w-full object-contain"
                                />
                            </div>
                            <div>
                                <p className="font-display text-xl font-bold leading-none tracking-tight">
                                    Sibuyan <span className="text-emerald-400">Alert</span>
                                </p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
                                    Accident Alert &amp; Mapping System
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Headline & Description */}
                    <section className={isFocusedPortal ? 'my-auto py-6' : 'my-8'}>
                        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                            Sibuyan Island incident coordination
                        </p>
                        {isRegistrationPortal ? (
                            <>
                                <h1 className="max-w-md font-display text-2xl font-bold leading-snug tracking-tight text-white xl:text-3xl">
                                    Become a verified reporter.
                                </h1>
                                <p className="mt-3 max-w-md text-xs sm:text-sm leading-relaxed text-brand-200/80">
                                    Create your account and complete identity verification before incident reporting is enabled.
                                </p>
                                <ol className="mt-6 space-y-3.5" aria-label="Reporter enrollment process">
                                    {reporterEnrollmentStages.map((stage, index) => (
                                        <li key={stage} className="flex items-center gap-3.5">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-900/40 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
                                                {index + 1}
                                            </span>
                                            <span className="text-xs sm:text-sm font-medium text-brand-200/90">{stage}</span>
                                        </li>
                                    ))}
                                </ol>
                            </>
                        ) : (
                            <>
                                <h1 className="max-w-md font-display text-2xl font-bold leading-snug tracking-tight text-white xl:text-3xl">
                                    Report, review, map, and coordinate accident response in one system.
                                </h1>
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
                                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <h2 className="text-xs font-bold text-white">{title}</h2>
                                    <p className="mt-1 text-[11px] leading-relaxed text-brand-200/70">{desc}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Coverage & System Footer */}
                    <div>
                        <MunicipalityCoverage compact={isFocusedPortal} />
                        <p className="mt-6 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-300/40">
                            © 2026 Sibuyan Alert System
                        </p>
                    </div>
                </div>
            </aside>

            {/* ── Right Content Panel ── */}
            <main className="auth-content relative flex min-h-dvh w-full items-center justify-center px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
                <div className={`w-full ${isRegistrationPortal ? 'max-w-[640px]' : 'max-w-[420px]'}`}>
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AuthLayout;
