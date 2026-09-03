import { forwardRef, useCallback, useMemo, useRef } from 'react';
import {
    Link as WouterLink,
    Redirect,
    Route as WouterRoute,
    Router,
    Switch,
    useLocation as useWouterLocation,
    useParams,
    useSearch,
    useSearchParams,
} from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

const EXTERNAL_OR_AMBIGUOUS_TARGET = /^(?:[a-z][a-z\d+.-]*:|\/\/)|\\/i;

export const normalizeInternalTarget = (target) => {
    if (typeof target !== 'string' || !target.startsWith('/') || EXTERNAL_OR_AMBIGUOUS_TARGET.test(target)) {
        throw new TypeError('Navigation target must be an absolute internal application path.');
    }

    return target;
};

export const BrowserRouter = ({ children }) => <Router>{children}</Router>;

export const MemoryRouter = ({ children, initialEntries = ['/'] }) => {
    const initialPath = normalizeInternalTarget(initialEntries[0] || '/');
    const locationRef = useRef(null);

    if (!locationRef.current) {
        locationRef.current = memoryLocation({ path: initialPath });
    }

    return <Router hook={locationRef.current.hook}>{children}</Router>;
};

export const Routes = Switch;

export const Route = ({ element, children, ...props }) => (
    <WouterRoute {...props}>{element ?? children}</WouterRoute>
);

const toSafeInternalTarget = (target) => {
    try {
        return normalizeInternalTarget(target);
    } catch {
        return '/';
    }
};

export const Navigate = ({ to, replace = false, state }) => (
    <Redirect to={toSafeInternalTarget(to)} replace={replace} state={state} />
);

export const useNavigate = () => {
    const [, navigate] = useWouterLocation();

    return useCallback((to, options) => {
        navigate(toSafeInternalTarget(to), options);
    }, [navigate]);
};

export const useLocation = () => {
    const [pathname] = useWouterLocation();
    const search = useSearch();

    return useMemo(() => ({
        pathname,
        search: search ? `?${search}` : '',
        hash: typeof window === 'undefined' ? '' : window.location.hash,
        state: typeof window === 'undefined' ? null : window.history.state,
    }), [pathname, search]);
};

export const Link = forwardRef(({ to, href, ...props }, ref) => (
    <WouterLink ref={ref} to={toSafeInternalTarget(to ?? href)} {...props} />
));
Link.displayName = 'Link';

export const NavLink = forwardRef(({
    to,
    end = false,
    className,
    children,
    ...props
}, ref) => {
    const location = useLocation();
    const target = toSafeInternalTarget(to);
    const targetPathname = target.split(/[?#]/, 1)[0] || '/';
    const isActive = end
        ? location.pathname === targetPathname
        : location.pathname === targetPathname
            || (targetPathname !== '/' && location.pathname.startsWith(`${targetPathname}/`));
    const resolvedClassName = typeof className === 'function'
        ? className({ isActive, isPending: false })
        : className;
    const resolvedChildren = typeof children === 'function'
        ? children({ isActive, isPending: false })
        : children;

    return (
        <WouterLink ref={ref} to={target} className={resolvedClassName} {...props}>
            {resolvedChildren}
        </WouterLink>
    );
});
NavLink.displayName = 'NavLink';

export { useParams, useSearchParams };
