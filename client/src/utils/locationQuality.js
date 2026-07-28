export const GPS_TARGET_ACCURACY_METERS = 30;
export const GPS_MAX_ACCURACY_METERS = 100;

export const isValidLocation = (location) => (
    Number.isFinite(location?.lat) && Number.isFinite(location?.lng)
);

export const assessGpsAccuracy = (accuracy) => {
    const meters = Number(accuracy);
    if (!Number.isFinite(meters) || meters < 0) return { usable: false, precise: false, message: 'GPS accuracy is unavailable.' };
    if (meters > GPS_MAX_ACCURACY_METERS) {
        return { usable: false, precise: false, message: `GPS accuracy is too low (${Math.round(meters)}m). Retry or place the pin manually.` };
    }
    return {
        usable: true,
        precise: meters <= GPS_TARGET_ACCURACY_METERS,
        message: meters <= GPS_TARGET_ACCURACY_METERS
            ? `Precise GPS position (${Math.round(meters)}m).`
            : `GPS position ready to confirm (${Math.round(meters)}m).`,
    };
};

export const buildLocationCapture = (source, accuracyMeters = null) => ({
    source,
    accuracyMeters: source === 'gps' ? accuracyMeters : null,
    capturedAt: new Date().toISOString(),
});
