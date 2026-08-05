import {
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineExclamation,
    HiOutlineFire,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineTrash,
} from 'react-icons/hi';
import { FIRE_TYPES, INCIDENT_CATEGORIES, SEVERITY_LEVELS } from './reportConfig';

const FieldError = ({ id, children }) => <p id={id} className="mt-1.5 text-xs font-medium text-red-600">{children}</p>;

const SectionHeader = ({ id, step, title, description }) => (
    <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Step {step}</p>
        <h2 id={id} className="mt-0.5 text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
);

const inputClass = 'mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100';

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
        <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="details-heading">
                <SectionHeader id="details-heading" step="2" title="Incident details" description="Provide the essential information responders need to assess the report." />

                <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                        <span className="text-xs font-medium text-gray-700">Accident type</span>
                        <select name="incidentType" value={formData.incidentType} onChange={handleChange} className={inputClass}>
                            {currentCategory?.types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                    </label>

                    <label>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            <HiOutlineClock className="h-3.5 w-3.5 text-gray-400" />
                            Incident date and time <span className="text-red-600">*</span>
                        </span>
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
                    </label>

                    <label className="sm:col-span-2">
                        <span className="text-xs font-medium text-gray-700">Severity</span>
                        <select value={formData.severity} onChange={(event) => setFormData((current) => ({ ...current, severity: event.target.value }))} className={inputClass}>
                            {SEVERITY_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                        </select>
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                            <span className={`h-2 w-2 rounded-full ${selectedSeverity?.dot || 'bg-gray-400'}`} />
                            {selectedSeverity?.description}
                        </span>
                    </label>

                    <div className="sm:col-span-2">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.fireInvolved}
                            onClick={() => setFormData((current) => ({ ...current, fireInvolved: !current.fireInvolved, fireType: 'gas_leak' }))}
                            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${formData.fireInvolved ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${formData.fireInvolved ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                                <HiOutlineFire className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-gray-900">Fire, gas leak, or explosion involved</span>
                                <span className="mt-0.5 block text-xs text-gray-500">Enable this when fire response may be required.</span>
                            </span>
                            <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${formData.fireInvolved ? 'bg-orange-600' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${formData.fireInvolved ? 'left-[18px]' : 'left-0.5'}`} />
                            </span>
                        </button>

                        {formData.fireInvolved && (
                            <label className="mt-3 block rounded-lg border border-orange-200 bg-orange-50 p-3">
                                <span className="text-xs font-medium text-orange-900">Fire-related condition</span>
                                <select name="fireType" value={formData.fireType} onChange={handleChange} className="mt-1.5 w-full rounded-lg border border-orange-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
                                    {FIRE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                                </select>
                            </label>
                        )}
                    </div>

                    <label className="sm:col-span-2">
                        <span className="text-xs font-medium text-gray-700">Description <span className="font-normal text-gray-400">(optional)</span></span>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={4} maxLength={2000} placeholder="Vehicles involved, road condition, direction of travel, or other useful details" className={`${inputClass} resize-y`} />
                        <span className="mt-1 block text-right text-[11px] text-gray-400">{formData.description.length}/2000</span>
                    </label>
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="casualties-heading">
                <SectionHeader id="casualties-heading" step="3" title="Casualties and injuries" description="Enter zero when none are known." />
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { name: 'casualties.injured', label: 'Injured', value: formData.casualties.injured },
                        { name: 'casualties.fatalities', label: 'Fatalities', value: formData.casualties.fatalities },
                        { name: 'casualties.missing', label: 'Missing', value: formData.casualties.missing },
                    ].map((field) => (
                        <label key={field.name}>
                            <span className="text-xs font-medium text-gray-700">{field.label}</span>
                            <input type="number" inputMode="numeric" name={field.name} value={field.value} onChange={handleChange} min="0" max="999" className={`${inputClass} text-center font-semibold`} />
                        </label>
                    ))}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="evidence-heading">
                <SectionHeader id="evidence-heading" step="4" title="Evidence photos" description="Optional. Upload up to five images, maximum 5 MB each." />

                {imagePreviews.length > 0 && (
                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {imagePreviews.map((preview, index) => (
                            <div key={`${preview.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                                <img src={preview} alt={`Evidence preview ${index + 1}`} className="aspect-square h-full w-full object-cover" />
                                <button type="button" onClick={() => removeImage(index)} aria-label={`Remove evidence photo ${index + 1}`} className="absolute right-1.5 top-1.5 rounded-md bg-white/95 p-1.5 text-red-600 shadow-sm hover:bg-white">
                                    <HiOutlineTrash className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {images.length < 5 && (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center transition hover:border-gray-400 hover:bg-gray-50">
                        <HiOutlinePhotograph className="h-6 w-6 text-gray-400" />
                        <span className="mt-2 text-sm font-medium text-gray-700">{images.length ? 'Add more photos' : 'Choose photos'}</span>
                        <span className="mt-0.5 text-xs text-gray-400">{images.length} of 5 selected</span>
                    </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="sr-only" aria-label="Upload evidence photos" />
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="submit-heading">
                <div className="flex items-start gap-3">
                    <HiOutlineShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <div>
                        <h2 id="submit-heading" className="text-sm font-semibold text-gray-900">Review before submitting</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Authorities will review this report before it appears publicly. Submit only accurate incident information.</p>
                    </div>
                </div>

                {(errors.location || errors.incidentTime) && (
                    <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                        <HiOutlineExclamation className="mt-0.5 h-4 w-4 shrink-0" />
                        Complete the required location and incident-time fields before submitting.
                    </div>
                )}

                <button type="submit" disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(220,38,38,0.75)] transition-all hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <HiOutlineExclamation className="h-4 w-4 shrink-0" />}
                    {loading ? 'Submitting report…' : 'Submit incident report'}
                </button>
            </section>
        </div>
    );
};

export default ReportDetailsPanel;
