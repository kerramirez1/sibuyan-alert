import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineArrowLeft,
    HiOutlineExclamation,
    HiOutlinePaperAirplane,
    HiOutlineX,
} from 'react-icons/hi';

const UPDATE_TYPES = [
    {
        value: 'need_help',
        label: 'Need urgent help',
        description: 'The situation is getting worse or more assistance is needed.',
        tone: 'danger',
    },
    {
        value: 'general',
        label: 'Situation changed',
        description: 'Share new conditions, hazards, or useful information.',
        tone: 'neutral',
    },
    {
        value: 'stabilized',
        label: 'Patient stabilized',
        description: 'The injured person is stable while waiting for or receiving help.',
        tone: 'success',
    },
    {
        value: 'transported',
        label: 'Patient transported',
        description: 'The injured person has been taken to a clinic or hospital.',
        tone: 'success',
    },
    {
        value: 'false_alarm',
        label: 'Possible false alarm',
        description: 'The reported incident may no longer exist or may be inaccurate.',
        tone: 'warning',
    },
    {
        value: 'other',
        label: 'Other update',
        description: 'Provide information that does not match the options above.',
        tone: 'neutral',
    },
];

const SENSITIVE_TYPES = new Set(['need_help', 'false_alarm']);

const TYPE_STYLES = {
    danger: 'border-red-200 bg-red-50 text-red-900 hover:border-red-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300',
    neutral: 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50',
};

const SELECTED_TYPE_STYLES = {
    danger: 'border-red-500 bg-red-50 ring-2 ring-red-500/15',
    warning: 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/15',
    success: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/15',
    neutral: 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/15',
};

const getFocusableElements = (container) => Array.from(container?.querySelectorAll(
    'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
) || []);

const SituationUpdateDialog = ({ isOpen, report, submitting, onClose, onSubmit }) => {
    const titleId = useId();
    const descriptionId = useId();
    const dialogRef = useRef(null);
    const messageRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const submittingRef = useRef(submitting);
    const requestInFlightRef = useRef(false);
    const [reportId, setReportId] = useState(null);
    const [tag, setTag] = useState('general');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);

    const selectedType = useMemo(
        () => UPDATE_TYPES.find((item) => item.value === tag) || UPDATE_TYPES[1],
        [tag]
    );
    const normalizedMessage = message.trim();
    const municipalityName = report?.municipalityName || report?.municipality?.name || 'the assigned municipality';

    useEffect(() => {
        onCloseRef.current = onClose;
        submittingRef.current = submitting;
    }, [onClose, submitting]);

    useEffect(() => {
        if (!report?._id || report._id === reportId) return;
        setReportId(report._id);
        setTag('general');
        setMessage('');
        setError('');
        setConfirming(false);
    }, [report?._id, reportId]);

    useEffect(() => {
        if (!isOpen) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusTimer = window.setTimeout(() => messageRef.current?.focus(), 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !submittingRef.current && !requestInFlightRef.current) {
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
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [isOpen]);

    if (!isOpen || !report) return null;

    const closeDialog = () => {
        if (!submitting && !requestInFlightRef.current) onClose();
    };

    const validate = () => {
        if (normalizedMessage.length < 5) {
            setError('Enter at least 5 characters so the response team has enough context.');
            messageRef.current?.focus();
            return false;
        }
        setError('');
        return true;
    };

    const requestSubmit = (event) => {
        event.preventDefault();
        if (!validate()) return;
        if (SENSITIVE_TYPES.has(tag)) {
            setConfirming(true);
            return;
        }
        void submitUpdate();
    };

    const submitUpdate = async () => {
        if (!validate() || submitting || requestInFlightRef.current) return;
        requestInFlightRef.current = true;
        setError('');
        try {
            const result = await onSubmit({ message: normalizedMessage, tag });
            if (!result?.success) {
                setError(result?.message || 'The update could not be sent. Your draft has been kept.');
                setConfirming(false);
                return;
            }
            setMessage('');
            setTag('general');
            setConfirming(false);
            onClose();
        } catch {
            setError('The update could not be sent. Your draft has been kept.');
            setConfirming(false);
        } finally {
            requestInFlightRef.current = false;
        }
    };

    const dialog = (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <button
                type="button"
                className="absolute inset-0 cursor-default bg-gray-950/55"
                onClick={closeDialog}
                aria-label="Close situation update dialog"
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Reporter update</p>
                        <h2 id={titleId} className="mt-1 text-lg font-bold text-gray-950">Send situation update</h2>
                        <p id={descriptionId} className="mt-1 truncate text-xs text-gray-500">
                            {report.address || 'Selected incident'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={closeDialog}
                        disabled={submitting}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                        aria-label="Close situation update dialog"
                    >
                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                    {confirming ? (
                        <div>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                disabled={submitting}
                                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
                            >
                                <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
                                Edit update
                            </button>
                            <div className={`mt-3 rounded-xl border p-4 ${tag === 'need_help' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                                <div className="flex items-start gap-3">
                                    <HiOutlineExclamation className={`mt-0.5 h-5 w-5 shrink-0 ${tag === 'need_help' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-950">Confirm {selectedType.label.toLowerCase()}</h3>
                                        <p className="mt-1 text-sm leading-6 text-gray-700">
                                            This will immediately notify the review and response team. Confirm that the information is current and accurate.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Message to send</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">{normalizedMessage}</p>
                            </div>
                        </div>
                    ) : (
                        <form id="situation-update-form" onSubmit={requestSubmit} noValidate>
                            <fieldset>
                                <legend className="text-sm font-semibold text-gray-900">What best describes the update?</legend>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Situation update type">
                                    {UPDATE_TYPES.map((item) => {
                                        const isSelected = tag === item.value;
                                        return (
                                            <button
                                                key={item.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={isSelected}
                                                onClick={() => { setTag(item.value); setError(''); }}
                                                className={`min-h-16 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${isSelected ? SELECTED_TYPE_STYLES[item.tone] : TYPE_STYLES[item.tone]}`}
                                            >
                                                <span className="block text-sm font-semibold">{item.label}</span>
                                                <span className="mt-0.5 block text-xs leading-5 text-gray-600">{item.description}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <div className="mt-5">
                                <div className="flex items-center justify-between gap-3">
                                    <label htmlFor="situation-update-message" className="text-sm font-semibold text-gray-900">What is happening now?</label>
                                    <span className="text-xs tabular-nums text-gray-500">{message.length}/500</span>
                                </div>
                                <textarea
                                    ref={messageRef}
                                    id="situation-update-message"
                                    value={message}
                                    onChange={(event) => { setMessage(event.target.value); if (error) setError(''); }}
                                    onKeyDown={(event) => {
                                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                            event.preventDefault();
                                            event.currentTarget.form?.requestSubmit();
                                        }
                                    }}
                                    rows={4}
                                    maxLength={500}
                                    placeholder="Example: The injured passenger has been transported to SDH."
                                    aria-invalid={Boolean(error)}
                                    aria-describedby={error ? 'situation-update-error' : 'situation-update-help'}
                                    className="mt-2 w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                                />
                                <p id="situation-update-help" className="mt-1.5 text-xs text-gray-500">
                                    This update will be shared with {municipalityName} reviewers and response teams. Press Ctrl/Command + Enter to send.
                                </p>
                            </div>
                        </form>
                    )}

                    {error && (
                        <p id="situation-update-error" role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </p>
                    )}
                </div>

                <footer className="border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
                    <div className="flex flex-col-reverse gap-2 min-[380px]:flex-row min-[380px]:justify-end">
                        <button
                            type="button"
                            onClick={confirming ? () => setConfirming(false) : closeDialog}
                            disabled={submitting}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {confirming ? 'Back' : 'Cancel'}
                        </button>
                        <button
                            type={confirming ? 'button' : 'submit'}
                            form={confirming ? undefined : 'situation-update-form'}
                            onClick={confirming ? () => void submitUpdate() : undefined}
                            disabled={submitting}
                            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${confirming && tag === 'need_help' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'}`}
                        >
                            <HiOutlinePaperAirplane className="h-4 w-4 rotate-90" aria-hidden="true" />
                            {submitting ? 'Sending…' : confirming ? 'Confirm and send' : 'Send update'}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );

    return createPortal(dialog, document.body);
};

export default SituationUpdateDialog;
