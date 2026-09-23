import {
    HiOutlineCamera,
    HiOutlineExclamation,
    HiOutlineTrash,
} from 'react-icons/hi';
import { INCIDENT_CATEGORIES, SEVERITY_LEVELS } from './reportConfig';

const FieldError = ({ id, children }) => (
    <p id={id} className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
        {children}
    </p>
);

const SectionHeader = ({ id, step, title, description }) => (
    <div>
        <p className="page-eyebrow">
            Step {step} of 4
        </p>
        <h2 id={id} className="section-title">
            {title}
        </h2>
        {description && (
            <p className="section-description">
                {description}
            </p>
        )}
    </div>
);

const inputClass = 'field-control';

const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ReportDetailsPanel = ({
    formData,
    setFormData,
    handleChange,
    errors,
    maxDateTime,
    images,
    imagePreviews,
    fileInputRef,
    cameraInputRef,
    handleImageChange,
    removeImage,
    onRetakeImage,
    loading,
    uploadProgress,
    deviceSaved,
    isOffline,
}) => {
    const currentCategory = INCIDENT_CATEGORIES[formData.incidentCategory];
    const selectedSeverity = SEVERITY_LEVELS.find((level) => level.value === formData.severity);

    return (
        <div className="surface-panel divide-y divide-[var(--border)] px-5 py-6 sm:px-6">
            {/* Step 2: Incident Details */}
            <section className="pb-6" aria-labelledby="details-heading">
                <SectionHeader
                    id="details-heading"
                    step="2"
                    title="Incident details"
                    description="Classify the incident, set the approximate time, and describe road or environmental conditions."
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <label className="block min-w-0">
                        <span className="field-label">
                            Accident type
                        </span>
                        <select
                            name="incidentType"
                            value={formData.incidentType}
                            onChange={handleChange}
                            className={inputClass}
                        >
                            {currentCategory?.types.map((type) => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block min-w-0">
                        <span className="field-label">
                            Incident date and time <span className="text-emerald-700 dark:text-emerald-400" aria-hidden="true">*</span>
                        </span>
                        <input
                            type="datetime-local"
                            name="incidentTime"
                            value={formData.incidentTime}
                            onChange={handleChange}
                            max={maxDateTime}
                            aria-invalid={Boolean(errors.incidentTime)}
                            aria-describedby={errors.incidentTime ? 'incident-time-error' : undefined}
                            className={`${inputClass} ${errors.incidentTime ? 'border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-800' : ''}`}
                        />
                        {errors.incidentTime && <FieldError id="incident-time-error">{errors.incidentTime}</FieldError>}
                    </label>

                    <label className="block sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                        <span className="field-label">
                            Severity
                        </span>
                        <select
                            value={formData.severity}
                            onChange={(event) => setFormData((current) => ({ ...current, severity: event.target.value }))}
                            className={inputClass}
                        >
                            {SEVERITY_LEVELS.map((level) => (
                                <option key={level.value} value={level.value}>{level.label}</option>
                            ))}
                        </select>
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedSeverity?.dot || 'bg-gray-400'}`} aria-hidden="true" />
                            <span>{selectedSeverity?.description}</span>
                        </span>
                    </label>

                    <label className="block sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                        <span className="field-label">
                            Description <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>
                        </span>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            maxLength={2000}
                            placeholder="Describe what happened, the road condition, direction of travel, or other useful details"
                            className="field-control min-h-28 resize-y"
                        />
                        <span className="mt-1 block text-right text-[11px] text-gray-400 dark:text-gray-500">
                            {formData.description?.length || 0}/2000
                        </span>
                    </label>
                </div>
            </section>

            {/* Step 3: Casualties and Injuries */}
            <section className="py-6" aria-labelledby="casualties-heading">
                <SectionHeader
                    id="casualties-heading"
                    step="3"
                    title="Casualties and injuries"
                    description="Leave a field blank if unknown. Enter zero only when you know there were none."
                />
                <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                        { name: 'casualties.injured', label: 'Injured', value: formData.casualties.injured },
                        { name: 'casualties.fatalities', label: 'Fatalities', value: formData.casualties.fatalities },
                        { name: 'casualties.missing', label: 'Missing', value: formData.casualties.missing },
                    ].map((field) => (
                        <div key={field.name}>
                            <label htmlFor={field.name} className="field-label text-center">
                                {field.label}
                            </label>
                            <input
                                id={field.name}
                                type="number"
                                inputMode="numeric"
                                name={field.name}
                                aria-label={field.label}
                                value={field.value}
                                onChange={handleChange}
                                min="0"
                                max="999"
                                placeholder="—"
                                className="field-control text-center font-semibold tabular-nums"
                            />
                        </div>
                    ))}
                </div>
            </section>

            {/* Step 4: Evidence Photos */}
            <section className="py-6" aria-labelledby="evidence-heading">
                <SectionHeader
                    id="evidence-heading"
                    step="4"
                    title="Evidence photos"
                    description="Optional. Capture evidence directly with your camera or select existing photos (up to 5 images, max 20 MB each)."
                />

                <div className="mt-4 space-y-3">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                            Attached photos ({images.length}/5)
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {images.length === 5 ? 'Maximum 5 photos reached' : `${5 - images.length} remaining`}
                        </span>
                    </div>

                    {imagePreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {imagePreviews.map((preview, index) => (
                                <div
                                    key={`${typeof preview === 'string' ? preview.slice(0, 32) : 'preview'}-${index}`}
                                    className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-gray-800"
                                >
                                    <img
                                        src={preview}
                                        alt={`Evidence preview ${index + 1}`}
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/40 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                        {onRetakeImage && (
                                            <button
                                                type="button"
                                                onClick={() => onRetakeImage(index)}
                                                aria-label={`Retake photo ${index + 1}`}
                                                title="Retake photo"
                                                className="rounded-lg bg-white/90 p-1.5 text-gray-800 hover:bg-white dark:bg-gray-900/90 dark:text-gray-200 dark:hover:bg-gray-900"
                                            >
                                                <HiOutlineCamera className="h-4 w-4" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeImage(index)}
                                            aria-label={`Remove photo ${index + 1}`}
                                            title="Remove photo"
                                            className="rounded-lg bg-red-600 p-1.5 text-white hover:bg-red-700"
                                        >
                                            <HiOutlineTrash className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {/* Touch fallback: hover affordances do not exist on mobile */}
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        aria-label={`Remove photo ${index + 1}`}
                                        className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white sm:hidden"
                                    >
                                        <HiOutlineTrash className="h-3.5 w-3.5" />
                                    </button>
                                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                                        #{index + 1}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {images.length < 5 ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => cameraInputRef?.current?.click()}
                                className="btn-outline"
                            >
                                {images.length > 0 ? 'Take another' : 'Take photo'}
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef?.current?.click()}
                                className="btn-outline"
                            >
                                {images.length > 0 ? 'Choose more' : 'Choose photos'}
                            </button>
                        </div>
                    ) : (
                        <p className="border-t border-gray-200 pt-3 text-xs text-gray-600 dark:border-white/10 dark:text-gray-400">
                            Maximum 5 evidence photos attached. Remove a photo to take or choose a replacement.
                        </p>
                    )}

                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageChange}
                        className="sr-only"
                        aria-label="Take evidence photo"
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="sr-only"
                        aria-label="Upload evidence photos"
                    />
                    <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                        Evidence is protected and shown according to your access permissions. Photos are kept local until you submit.
                    </p>
                </div>
            </section>

            {/* Submission Checkpoint */}
            <section className="pt-6" aria-labelledby="submit-heading">
                <h2 id="submit-heading" className="section-title">
                    Review before submitting
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                    Authorities will review this report before it appears publicly. Submit only accurate incident information.
                </p>

                {(errors.location || errors.incidentTime) && (
                    <div
                        role="alert"
                        className="mt-3 flex items-start gap-2 border-l-2 border-red-500 py-1 pl-3 text-xs font-medium text-red-700 dark:text-red-300"
                    >
                        <HiOutlineExclamation className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Complete the required location and incident-time fields before submitting.</span>
                    </div>
                )}

                {loading && deviceSaved && (
                    <p role="status" className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Saved on this device — sending to dispatch…
                    </p>
                )}

                {loading && uploadProgress && (
                    <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                            <span>
                                {uploadProgress.percent !== null && uploadProgress.percent < 100
                                    ? `Uploading data & evidence: ${uploadProgress.percent}%`
                                    : 'Submitting report to emergency dispatch…'}
                            </span>
                            {uploadProgress.total > 0 && (
                                <span className="tabular-nums text-gray-500 dark:text-gray-400">
                                    {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
                                </span>
                            )}
                        </div>
                        <div
                            role="progressbar"
                            aria-valuenow={uploadProgress.percent ?? 0}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                        >
                            <div
                                className="h-full rounded-full bg-red-600 transition-all duration-200 dark:bg-red-500"
                                style={{ width: `${uploadProgress.percent ?? 0}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="mt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex min-h-[44px] w-full flex-1 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
                    >
                        {loading ? (
                            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                        ) : null}
                        {loading
                            ? (uploadProgress?.percent !== null && uploadProgress?.percent !== undefined
                                ? `Uploading ${uploadProgress.percent}%…`
                                : 'Submitting report…')
                            : 'Submit incident report'}
                    </button>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Submitting auto-saves on this device if the signal drops and sends when the connection returns.
                </p>

                {isOffline && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        Device is offline. Reports saved offline are safely stored locally and submitted automatically once signal is restored.
                    </p>
                )}
            </section>
        </div>
    );
};

export default ReportDetailsPanel;
