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

const AuthLayout = ({ children }) => (
    <div className="auth-shell min-h-dvh bg-gray-50 font-sans text-gray-900 selection:bg-brand-200 selection:text-brand-900 dark:text-gray-100 lg:grid lg:grid-cols-[minmax(410px,42%)_minmax(0,1fr)]">
        <aside className="auth-overview hidden min-h-dvh border-r border-brand-900 bg-brand-950 text-white lg:flex lg:flex-col" aria-label="Sibuyan Alert system overview">
            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-10 py-12 xl:px-14">
                <div className="mb-10 flex items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-white/20">
                        <img
                            src="/icons/Alert.png"
                            alt=""
                            className="h-full w-full object-contain"
                        />
                    </div>
                    <div>
                        <p className="font-display text-2xl font-bold leading-none tracking-tight">
                            Sibuyan <span className="text-emerald-400">Alert</span>
                        </p>
                        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">
                            Accident Alert &amp; Mapping System
                        </p>
                    </div>
                </div>

                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                    Sibuyan Island incident coordination
                </p>
                <h1 className="max-w-lg font-display text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
                    Report, review, map, and coordinate accident response in one system.
                </h1>
                <p className="mt-4 max-w-lg text-sm leading-6 text-brand-200/80">
                    Built for residents, municipal administrators, and emergency response units across Sibuyan Island.
                </p>

                <div className="mt-10 grid grid-cols-2 border-y border-white/10">
                    {features.map(({ Icon, title, desc }, index) => (
                        <div
                            key={title}
                            className={`py-5 ${index % 2 === 0 ? 'border-r border-white/10 pr-5' : 'pl-5'} ${index < 2 ? 'border-b border-white/10' : ''}`}
                        >
                            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                            </div>
                            <h2 className="text-sm font-semibold text-white">{title}</h2>
                            <p className="mt-1.5 text-xs leading-5 text-brand-200/70">{desc}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex items-center gap-3 border-t border-white/10 pt-6">
                    <div className="flex shrink-0 items-center gap-1.5" aria-label="Municipality seals">
                        {municipalitySeals.map(({ name, src, imageClass }) => (
                            <span key={name} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-white/20" title={name}>
                                <img src={src} alt={`${name} seal`} className={`h-full w-full object-contain ${imageClass}`} />
                            </span>
                        ))}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-white">Coverage across 3 municipalities</p>
                        <p className="mt-0.5 text-[11px] text-brand-300/70">Cajidiocan · Magdiwang · San Fernando</p>
                    </div>
                </div>
            </div>

            <p className="px-10 pb-7 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-brand-300/50 xl:px-14">
                © 2026 Sibuyan Alert System
            </p>
        </aside>

        <main className="auth-content relative flex min-h-dvh w-full items-center justify-center bg-gray-50 px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
            <div className="w-full max-w-[440px]">
                {children}
            </div>
        </main>
    </div>
);

export default AuthLayout;
