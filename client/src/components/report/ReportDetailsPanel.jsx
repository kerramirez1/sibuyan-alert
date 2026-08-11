import {
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineFire,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineTrash,
} from 'react-icons/hi';
import { FIRE_TYPES, INCIDENT_CATEGORIES, SEVERITY_LEVELS } from './reportConfig';

const FieldError = ({ id, children }) => <p id={id} className="mt-1.5 text-xs font-medium text-red-600">{children}</p>;

const SectionHeader = ({ id, step, title, description }) => (
    <div className="mb-0 border-b border-gray-300 bg-gray-100 p-4 sm:p-5 dark:border-gray-600 dark:bg-gray-800">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Step {step}</p>
        <h2 id={id} className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
    </div>
);

const inputClass = 'h-[42px] w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-gray-700';

const sectionClass = 'border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900';

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
        <div className="space-y-4 lg:space-y-5">
            <section className={sectionClass} aria-labelledby="details-heading">
                <SectionHeader id="details-heading" step="2" title="Incident details" />

                <div className="grid gap-4 p-4 sm:p-5 sm:grid-cols-2">
                    <label className="flex h-full flex-col min-w-0">
                        <span className="mb-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">Accident type</span>
                        <div className="mt-auto">
                            <select name="incidentType" value={formData.incidentType} onChange={handleChange} className={inputClass}>
                                {currentCategory?.types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                        </div>
                    </label>

                    <label className="flex h-full flex-col min-w-0">
                        <span className="mb-1.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                            <HiOutlineClock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            Incident date and time <span className="text-brand-600 dark:text-brand-400">*</span>
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
                                className={`${inputClass} ${errors.incidentTime ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
                            />
                            {errors.incidentTime && <FieldError id="incident-time-error">{errors.incidentTime}</FieldError>}
                        </div>
                    </label>

                    <label className="flex h-full flex-col sm:col-span-2">
                        <span className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Severity</span>
                        <div className="mt-auto">
                            <select value={formData.severity} onChange={(event) => setFormData((current) => ({ ...current, severity: event.target.value }))} className={inputClass}>
                                {SEVERITY_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                            </select>
                            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                <span className={`h-2 w-2 rounded-full ${selectedSeverity?.dot || 'bg-gray-400'}`} />
                                {selectedSeverity?.description}
                            </span>
                        </div>
                    </label>

                    <div className="sm:col-span-2 pt-2 pb-1 border-t border-b border-gray-100 my-1 dark:border-gray-700">
                        <div className="flex w-full items-center justify-between gap-3 py-1.5">
                            <div className="flex items-start gap-2.5">
                                <HiOutlineFire className="mt-0.5 h-5 w-5 text-gray-400" />
                                <div>
                                    <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">Fire, gas leak, or explosion involved</span>
                                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">Enable this when fire response may be required.</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={formData.fireInvolved}
                                onClick={() => setFormData((current) => ({ ...current, fireInvolved: !current.fireInvolved, fireType: 'gas_leak' }))}
                                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${formData.fireInvolved ? 'bg-orange-600' : 'bg-gray-200'}`}
                            >
                                <span className={`absolute top-1 inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.fireInvolved ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {formData.fireInvolved && (
                            <label className="mt-3 flex flex-col pl-7 pr-12 pb-2">
                                <span className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Fire-related condition</span>
                                <div className="mt-auto">
                                    <select name="fireType" value={formData.fireType} onChange={handleChange} className={inputClass}>
                                        {FIRE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                                    </select>
                                </div>
                            </label>
                        )}
                    </div>

                    <label className="flex h-full flex-col sm:col-span-2">
                        <span className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Description <span className="font-normal text-gray-500">(optional)</span></span>
                        <div className="mt-auto">
                            <textarea name="description" value={formData.description} onChange={handleChange} rows={4} maxLength={2000} placeholder="Vehicles involved, road condition, direction of travel, or other useful details" className={`${inputClass.replace('h-[42px]', '')} resize-y min-h-[100px] py-3`} />
                            <span className="mt-1 block text-right text-[11px] text-gray-400">{formData.description.length}/2000</span>
                        </div>
                    </label>
                </div>
            </section>

            <section className={sectionClass} aria-labelledby="casualties-heading">
                <SectionHeader id="casualties-heading" step="3" title="Casualties and injuries" description="Enter zero when none are known." />
                <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
                    {[
                        { name: 'casualties.injured', label: 'Injured', value: formData.casualties.injured },
                        { name: 'casualties.fatalities', label: 'Fatalities', value: formData.casualties.fatalities },
                        { name: 'casualties.missing', label: 'Missing', value: formData.casualties.missing },
                    ].map((field) => (
                        <label key={field.name} className="flex h-full flex-col">
                            <span className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{field.label}</span>
                            <div className="mt-auto">
                                <input type="number" inputMode="numeric" name={field.name} value={field.value} onChange={handleChange} min="0" max="999" className={`${inputClass} text-center font-bold`} />
                            </div>
                        </label>
                    ))}
                </div>
            </section>

            <section className={sectionClass} aria-labelledby="evidence-heading">
                <SectionHeader id="evidence-heading" step="4" title="Evidence photos" description="Optional. Upload up to five images, maximum 5 MB each." />
                
                <div className="p-4 sm:p-5">
                {imagePreviews.length > 0 && (
                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {imagePreviews.map((preview, index) => (
                            <div key={`${preview.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-sm border border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800">
                                <img src={preview} alt={`Evidence preview ${index + 1}`} className="aspect-square h-full w-full object-cover" />
                                <button type="button" onClick={() => removeImage(index)} aria-label={`Remove evidence photo ${index + 1}`} className="absolute right-1.5 top-1.5 rounded-md bg-white/95 p-1.5 text-red-600 shadow-sm hover:bg-white">
                                    <HiOutlineTrash className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {images.length < 5 && (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-sm border-2 border-dashed border-gray-300 px-4 py-6 text-center transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                        <HiOutlinePhotograph className="h-6 w-6 text-gray-400" />
                        <span className="mt-2 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{images.length ? 'Add more photos' : 'Choose photos'}</span>
                        <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500">{images.length} of 5 selected</span>
                    </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="sr-only" aria-label="Upload evidence photos" />
                </div>
            </section>

            <section aria-labelledby="submit-heading">
                <div className="flex items-start gap-3">
                    <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400" />
                    <div>
                        <h2 id="submit-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">Review before submitting</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">Authorities will review this report before it appears publicly. Submit only accurate incident information.</p>
                    </div>
                </div>

                {(errors.location || errors.incidentTime) && (
                    <div role="alert" className="mt-4 flex items-start gap-2 rounded-sm border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-400">
                        <HiOutlineExclamation className="mt-0.5 h-4 w-4 shrink-0" />
                        Complete the required location and incident-time fields before submitting.
                    </div>
                )}

                <button type="submit" disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-brand-600 px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <HiOutlineExclamation className="h-4 w-4 shrink-0" />}
                    {loading ? 'Submitting report…' : 'Submit incident report'}
                </button>
            </section>
        </div>
    );
};

export default ReportDetailsPanel;
