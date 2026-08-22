import {
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineTrash,
    HiOutlineUserGroup,
} from 'react-icons/hi';
import { INCIDENT_CATEGORIES, SEVERITY_LEVELS } from './reportConfig';

const FieldError = ({ id, children }) => (
    <p id={id} className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
        {children}
    </p>
);

const SectionHeader = ({ id, step, title, description, icon: Icon }) => (
    <div className="border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2">
            {Icon && (
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Icon className="h-3.5 w-3.5" />
                </span>
            )}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Step {step} of 4
                </p>
                <h2 id={id} className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                    {title}
                </h2>
            </div>
        </div>
        {description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {description}
            </p>
        )}
    </div>
);

const inputClass = 'h-9 w-full rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-800 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200';

const sectionClass = 'overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90';

const ReportDetailsPanel = ({
    formData,
    setFormData,
    handleChange,
    errors,
    maxDateTime,
    images,
    imagePreviews,
    fileInputRef,
    handleImageChange,
    removeImage,
    loading,
}) => {
    const currentCategory = INCIDENT_CATEGORIES[formData.incidentCategory];
    const selectedSeverity = SEVERITY_LEVELS.find((level) => level.value === formData.severity);

    return (
        <div className="space-y-4 sm:space-y-5">
            {/* Step 2: Incident Details */}
            <section className={sectionClass} aria-labelledby="details-heading">
                <SectionHeader
                    id="details-heading"
                    step="2"
                    title="Incident details"
                    description="Classify the incident, set the approximate time, and describe road or environmental conditions."
                />

                <div className="grid gap-3.5 p-3.5 sm:gap-4 sm:p-4 sm:grid-cols-2">
                    <label className="flex h-full flex-col min-w-0">
                        <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Accident type
                        </span>
                        <div className="mt-auto">
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
                        </div>
                    </label>

                    <label className="flex h-full flex-col min-w-0">
                        <span className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            <HiOutlineClock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span>Incident date and time <span className="text-emerald-700 dark:text-emerald-400">*</span></span>
                        </span>
                        <div className="mt-auto">
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
                        </div>
                    </label>

                    <label className="flex h-full flex-col sm:col-span-2">
                        <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Severity
                        </span>
                        <div className="mt-auto">
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
                                <span className={`h-2 w-2 rounded-full ${selectedSeverity?.dot || 'bg-gray-400'}`} />
                                <span>{selectedSeverity?.description}</span>
                            </span>
                        </div>
                    </label>

                    <label className="flex h-full flex-col sm:col-span-2">
                        <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Description <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
                        </span>
                        <div className="mt-auto">
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows={3}
                                maxLength={2000}
                                placeholder="Describe what happened, the road condition, direction of travel, or other useful details"
                                className="w-full resize-y min-h-[80px] rounded-xl border border-gray-200/90 bg-white p-3 text-xs font-semibold text-gray-800 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                            />
                            <span className="mt-1 block text-right text-[11px] text-gray-400 dark:text-gray-500">
                                {formData.description?.length || 0}/2000
                            </span>
                        </div>
                    </label>
                </div>
            </section>

            {/* Step 3: Casualties and Injuries */}
            <section className={sectionClass} aria-labelledby="casualties-heading">
                <SectionHeader
                    id="casualties-heading"
                    step="3"
                    title="Casualties and injuries"
                    description="Enter zero when none are known."
                    icon={HiOutlineUserGroup}
                />
                <div className="grid grid-cols-3 gap-2.5 p-3.5 sm:gap-3.5 sm:p-4">
                    {[
                        { name: 'casualties.injured', label: 'Injured', value: formData.casualties.injured, tone: formData.casualties.injured > 0 ? 'amber' : 'neutral' },
                        { name: 'casualties.fatalities', label: 'Fatalities', value: formData.casualties.fatalities, tone: formData.casualties.fatalities > 0 ? 'red' : 'neutral' },
                        { name: 'casualties.missing', label: 'Missing', value: formData.casualties.missing, tone: formData.casualties.missing > 0 ? 'orange' : 'neutral' },
                    ].map((field) => {
                        const isNonZero = field.value > 0;
                        return (
                            <label key={field.name} className="flex h-full flex-col">
                                <span className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                                    {field.label}
                                </span>
                                <div className="mt-auto">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        name={field.name}
                                        value={field.value}
                                        onChange={handleChange}
                                        min="0"
                                        max="999"
                                        className={`${inputClass} text-center font-bold ${
                                            isNonZero
                                                ? 'border-amber-400 bg-amber-50/40 text-amber-950 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200'
                                                : ''
                                        }`}
                                    />
                                </div>
                            </label>
                        );
                    })}
                </div>
            </section>

            {/* Step 4: Evidence Photos */}
            <section className={sectionClass} aria-labelledby="evidence-heading">
                <SectionHeader
                    id="evidence-heading"
                    step="4"
                    title="Evidence photos"
                    description="Optional. Upload up to five images, maximum 5 MB each."
                    icon={HiOutlinePhotograph}
                />

                <div className="p-3.5 sm:p-4 space-y-3">
                    {imagePreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {imagePreviews.map((preview, index) => (
                                <div
                                    key={`${preview.slice(0, 24)}-${index}`}
                                    className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 dark:border-white/10 dark:bg-gray-800 shadow-2xs"
                                >
                                    <img src={preview} alt={`Evidence preview ${index + 1}`} className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        aria-label={`Remove evidence photo ${index + 1}`}
                                        className="absolute right-1 top-1 rounded-lg bg-white/95 p-1 text-red-600 shadow-2xs hover:bg-white dark:bg-gray-900/95 dark:text-red-400 cursor-pointer"
                                    >
                                        <HiOutlineTrash className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {images.length < 5 && (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200/90 p-4 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/30 dark:border-white/10 dark:hover:border-emerald-700/50 dark:hover:bg-emerald-950/10 cursor-pointer min-h-[44px]"
                        >
                            <HiOutlinePhotograph className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                            <span className="mt-1.5 text-xs font-bold text-gray-800 dark:text-gray-200">
                                {images.length ? 'Add more photos' : 'Choose photos'}
                            </span>
                            <span className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                                {images.length} of 5 selected
                            </span>
                        </button>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="sr-only"
                        aria-label="Upload evidence photos"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                        Evidence is protected and shown according to your access permissions.
                    </p>
                </div>
            </section>

            {/* Submission Checkpoint */}
            <section
                className="rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
                aria-labelledby="submit-heading"
            >
                <div className="flex items-start gap-2.5">
                    <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <div>
                        <h2 id="submit-heading" className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                            Review before submitting
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                            Authorities will review this report before it appears publicly. Submit only accurate incident information.
                        </p>
                    </div>
                </div>

                {/* Missing required error message */}
                {(errors.location || errors.incidentTime) && (
                    <div
                        role="alert"
                        className="mt-3 flex items-start gap-2 rounded-xl border border-red-200/90 bg-red-50/80 p-3 text-xs font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    >
                        <HiOutlineExclamation className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Complete the required location and incident-time fields before submitting.</span>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-3.5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer min-h-[44px]"
                >
                    {loading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                        <HiOutlineShieldCheck className="h-4 w-4 shrink-0" />
                    )}
                    <span>{loading ? 'Submitting report…' : 'Submit incident report'}</span>
                </button>
            </section>
        </div>
    );
};

export default ReportDetailsPanel;
