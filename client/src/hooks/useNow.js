import { useEffect, useState } from 'react';

// A ticking clock for time-gated UI (e.g. the self-dispatch countdown).
// Ticks only while `active` is true, so idle views hold no timer; when it
// flips false the last value simply stops advancing.
const useNow = (active = true, intervalMs = 1000) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        if (!active) return undefined;
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [active, intervalMs]);

    return now;
};

export default useNow;
