import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineLocationMarker, HiOutlineMap, HiOutlineX } from 'react-icons/hi';
import Button from '../ui/Button';
import MapView from '../map/MapView';
import toast from '../../utils/appToast';
import { updateQueuedReportLocation } from '../../utils/offlineReportQueue';
import { assessGpsAccuracy, isValidLocation } from '../../utils/locationQuality';

/**
 * Fixes the location on a blocked queued report in place.
 *
 * The server refused the stored position because the GPS fix was worse than
 * 100 meters. Retrying the stored payload cannot succeed — it is byte-for-byte
 * what the server just refused — so this dialog lets the reporter correct the
 * location instead: capture a fresh GPS fix, or place the pin by hand.
 *
 * The correction patches the existing queue entry: attachments, reporter,
 * queue position and the `clientReportId` idempotency key are untouched, and
 * the block is cleared in the same patch so the next sync pass delivers the
 * corrected payload. The entry still leaves the queue only after the server
 * acknowledges the replay. Cancelling, a GPS failure, or a vanished entry all
 * leave the stored report exactly as it was.
 */
const getFocusableElements = (container) => Array.from(container?.querySelectorAll(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
) || []);

const describeGpsError = (error) => {
    if (error?.code === 1) return 'Location permission denied. Please enable GPS permissions, or place the pin manually.';
    if (error?.code === 2) return 'GPS signal weak or unavailable. Place the pin manually.';
    if (error?.code === 3) return 'Location request timed out. Try again, or place the pin manually.';
    return 'Location error. Place the pin manually.';
};

const QueuedReportLocationFix = ({ isOpen, blockedReport, isOnline = true, onClose }) => {
    const titleId = useId();
    const descriptionId = useId();
    const dialogRef = useRef(null);
    const firstControlRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const savingRef = useRef(false);
    const wasOpenRef = useRef(false);

    const [mode, setMode] = useState('gps');
    const [gpsCapture, setGpsCapture] = useState(null);
    const [gpsError, setGpsError] = useState('');
    const [capturingGps, setCapturingGps] = useState(false);
    const [pinLocation, setPinLocation] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const clientReportId = blockedReport?.clientReportId || null;
    const storedCoordinates = blockedReport?.coordinates || null;

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // A fresh dialog for every open: never carry a previous capture, pin, or
    // error into a new correction — including when the same report is
    // re-blocked and fixed a second time.
    useEffect(() => {
        if (!isOpen || wasOpenRef.current) return;
        setMode('gps');
        setGpsCapture(null);
        setGpsError('');
        setCapturingGps(false);
        setPinLocation(storedCoordinates && isValidLocation(storedCoordinates) ? { ...storedCoordinates } : null);
        setSaving(false);
        setError('');
    }, [isOpen, clientReportId, storedCoordinates]);

    useEffect(() => {
        if (!isOpen) return undefined;

        wasOpenRef.current = true;
        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusTimer = window.setTimeout(() => firstControlRef.current?.focus(), 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !savingRef.current) {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = getFocusableElements(dialogRef.current);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            wasOpenRef.current = false;
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [isOpen]);

    if (!isOpen || !blockedReport) return null;

    const closeDialog = () => {
        if (!savingRef.current) onClose();
    };

    const captureGps = () => {
        const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
        if (!geolocation?.getCurrentPosition) {
            setGpsCapture(null);
            setGpsError('Geolocation is not supported by this browser. Place the pin manually.');
            return;
        }
        setCapturingGps(true);
        setGpsError('');
        geolocation.getCurrentPosition(
            (position) => {
                setCapturingGps(false);
                const coords = position?.coords;
                const location = { lat: Number(coords?.latitude), lng: Number(coords?.longitude) };
                const accuracy = Number.isFinite(coords?.accuracy) ? coords.accuracy : null;
                const assessment = assessGpsAccuracy(accuracy);
                if (isValidLocation(location) && assessment.usable) {
                    setGpsCapture({ ...location, accuracyMeters: accuracy });
                    setGpsError('');
                    return;
                }
                // A still-unusable fix is not offered for saving: accepting it
                // would queue the same rejection the reporter is fixing.
                setGpsCapture(null);
                setGpsError(`${assessment.message} Place the pin manually, or retry GPS.`);
            },
            (error) => {
                setCapturingGps(false);
                setGpsCapture(null);
                setGpsError(describeGpsError(error));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    };

    const saveCorrection = async (correction) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setError('');
        try {
            const saved = await updateQueuedReportLocation(clientReportId, correction);
            if (!saved) {
                toast.error('That queued report is no longer on this device.');
                onClose();
                return;
            }
            toast.success(isOnline
                ? 'Location updated. Resending the report.'
                : 'Location saved. It will be sent when you are back online.');
            onClose();
        } catch {
            setError('The location could not be saved. The queued report and its attachments are untouched.');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const saveGpsCorrection = () => {
        if (!gpsCapture || !isValidLocation(gpsCapture)) return;
        void saveCorrection({
            lat: gpsCapture.lat,
            lng: gpsCapture.lng,
            locationSource: 'gps',
            locationAccuracy: gpsCapture.accuracyMeters,
        });
    };

    const savePinCorrection = () => {
        if (!pinLocation || !isValidLocation(pinLocation)) return;
        // A hand-placed pin drops the stale GPS accuracy outright: the queue
        // patch deletes it rather than carrying the refused meters forward.
        void saveCorrection({
            lat: pinLocation.lat,
            lng: pinLocation.lng,
            locationSource: 'map_pin',
        });
    };

    const switchMode = (nextMode) => {
        if (savingRef.current) return;
        setMode(nextMode);
        setError('');
    };

    const mapFocus = storedCoordinates && isValidLocation(storedCoordinates)
        ? { lat: storedCoordinates.lat, lng: storedCoordinates.lng, zoom: 14 }
        : null;

    const dialog = (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <button
                type="button"
                className="absolute inset-0 cursor-default bg-gray-950/55"
                onClick={closeDialog}
                aria-label="Close location correction dialog"
                tabIndex={-1}
            />
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
            >
                <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Queued report</p>
                        <h2 id={titleId} className="mt-1 text-lg font-bold text-gray-950">Fix report location</h2>
                        <p id={descriptionId} className="mt-1 truncate text-xs text-gray-500">
                            {blockedReport.label}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={closeDialog}
                        disabled={saving}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                        aria-label="Close location correction dialog"
                    >
                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                    <p className="text-sm leading-6 text-gray-700">
                        The server refused the stored position: {blockedReport.blockedReason}
                        {' '}Correct the location below — the corrected report is sent as the same queued report, with its photos kept.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Location correction method">
                        <button
                            ref={firstControlRef}
                            type="button"
                            onClick={() => switchMode('gps')}
                            aria-pressed={mode === 'gps'}
                            disabled={saving}
                            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                                mode === 'gps'
                                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <HiOutlineLocationMarker className="h-4 w-4" aria-hidden="true" />
                            Use current GPS
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode('map')}
                            aria-pressed={mode === 'map'}
                            disabled={saving}
                            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
                                mode === 'map'
                                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <HiOutlineMap className="h-4 w-4" aria-hidden="true" />
                            Choose on map
                        </button>
                    </div>

                    {mode === 'gps' ? (
                        <div className="mt-4">
                            {!gpsCapture ? (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-sm text-gray-600">
                                        Capture a fresh GPS position. Only a fix within 100 meters can be saved.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        className="mt-3 rounded-md"
                                        onClick={captureGps}
                                        disabled={capturingGps || saving}
                                    >
                                        {capturingGps ? 'Capturing GPS…' : gpsError ? 'Retry GPS' : 'Capture GPS position'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                    <p className="text-sm font-semibold text-emerald-800">
                                        {assessGpsAccuracy(gpsCapture.accuracyMeters).message}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            className="rounded-md"
                                            onClick={saveGpsCorrection}
                                            disabled={saving}
                                        >
                                            {saving ? 'Saving…' : 'Save and resend'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="rounded-md"
                                            onClick={captureGps}
                                            disabled={capturingGps || saving}
                                        >
                                            Recapture
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {gpsError && (
                                <p role="alert" className="mt-3 text-sm leading-6 text-red-700">
                                    {gpsError}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="mt-4">
                            <p className="text-sm text-gray-600">
                                Tap the map or drag the pin to the incident. The map opens on the refused position.
                            </p>
                            <div className="mt-3 h-72 overflow-hidden rounded-xl border border-gray-200">
                                <MapView
                                    mode="report-location"
                                    selectedLocation={pinLocation}
                                    onLocationSelect={(location) => {
                                        if (isValidLocation(location)) setPinLocation({ ...location });
                                    }}
                                    focusLocation={mapFocus}
                                    height="100%"
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    className="rounded-md"
                                    onClick={savePinCorrection}
                                    disabled={saving || !isValidLocation(pinLocation)}
                                >
                                    {saving ? 'Saving…' : 'Save pin and resend'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="mt-3 text-sm leading-6 text-red-700">
                            {error}
                        </p>
                    )}
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 sm:px-5">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-md"
                        onClick={closeDialog}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                </footer>
            </section>
        </div>
    );

    return createPortal(dialog, document.body);
};

export default QueuedReportLocationFix;
