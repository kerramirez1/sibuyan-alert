import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a dismissible surface mounted for `delayMs` after `isOpen` turns
 * false so a CSS exit animation can play, then unmounts it.
 *
 * This is the CSS replacement for framer-motion's AnimatePresence exit
 * animations: the caller renders while `shouldRender` is true and applies an
 * `is-closing` class (which swaps the enter keyframes for exit keyframes)
 * while `isClosing` is true.
 *
 * Reopening mid-close cancels the pending unmount immediately.
 *
 * @param {boolean} isOpen   Whether the surface is open.
 * @param {number}  delayMs  How long the exit animation runs (default 150ms).
 * @returns {{ shouldRender: boolean, isClosing: boolean }}
 */
export const useClosingDelay = (isOpen, delayMs = 150) => {
    const [isClosing, setIsClosing] = useState(false);
    const prevIsOpenRef = useRef(isOpen);
    const timerRef = useRef(null);

    useEffect(() => {
        const wasOpen = prevIsOpenRef.current;
        prevIsOpenRef.current = isOpen;

        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (wasOpen && !isOpen) {
            // Just closed: stay mounted for the exit animation.
            setIsClosing(true);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                setIsClosing(false);
            }, delayMs);
        } else {
            // Open, or reopened mid-close: no exit in flight.
            setIsClosing(false);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isOpen, delayMs]);

    return {
        shouldRender: isOpen || isClosing,
        isClosing: isClosing && !isOpen,
    };
};

export default useClosingDelay;
