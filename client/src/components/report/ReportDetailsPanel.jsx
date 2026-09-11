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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Step {step} of 4
        </p>
        <h2 id={id} className="mt-1 text-base font-bold text-gray-900 sm:text-lg dark:text-white">
            {title}
        </h2>
        {description && (
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                {description}
            </p>
        )}
    </div>
);

const inputClass = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200';

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
}) => {
    const currentCategory = INCIDENT_CATEGORIES[formData.incidentCategory];
    const selectedSeverity = SEVERITY_LEVELS.find((level) => level.value === formData.severity);

    return (
        <div className="divide-y divide-gray-200 dark:divide-white/10">
            {/* Step 2: Incident Details */}
            <section className="pb-6" aria-labelledby="details-heading">
                <SectionHeader
                    id="details-heading"
                    step="2"
                    title="Incident details"
                    description="Classify the incident, set the approximate time, and describe road or environmental conditions."
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block min-w-0">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
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
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
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

                    <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
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

                    <label className="block sm:col-span-2">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                            Description <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>
                        </span>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            maxLength={2000}
                            placeholder="Describe what happened, the road condition, direction of travel, or other useful details"
                            className="min-h-[80px] w-full resize-y rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:min-h-[96px] dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
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
                            <label htmlFor={field.name} className="mb-1 block cursor-pointer text-center text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
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
                                className="h-10 w-full rounded-lg border border-gray-300 bg-white text-center text-sm font-semibold tabular-nums text-gray-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
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
                    description="Optional. Capture evidence directly with your camera or select existing photos (up to 5 images, max 5 MB each)."
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
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                {images.length > 0 ? 'Take another' : 'Take photo'}
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef?.current?.click()}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5"
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
                <h2 id="submit-heading" className="text-base font-bold text-gray-900 sm:text-lg dark:text-white">
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

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
                >
                    {loading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                    ) : null}
                    {loading ? 'Submitting report…' : 'Submit incident report'}
                </button>
            </section>
        </div>
    );
};

export default ReportDetailsPanel;
