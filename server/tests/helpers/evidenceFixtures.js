import sharp from 'sharp';

/**
 * Paints a natural photographic human face onto an 8-bit grayscale pixel buffer.
 */
export const paintNaturalFace = (gray, w, h, cx, cy, rx, ry) => {
    for (let y = Math.max(0, cy - ry - 20); y < Math.min(h, cy + ry + 20); y++) {
        for (let x = Math.max(0, cx - rx - 20); x < Math.min(w, cx + rx + 20); x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            const distSq = dx * dx + dy * dy;

            if (distSq <= 1.0) {
                // Face base oval
                let lum = 190 - (dx * dx * 30) + (dy * 10);

                // Forehead (dy between -0.7 and -0.3)
                if (dy >= -0.7 && dy <= -0.3 && Math.abs(dx) < 0.6) {
                    lum = 210;
                }
                // Eye sockets (dy ~ -0.15, dx ~ -0.42 and +0.42)
                const eyeLy = cy - ry * 0.15;
                const eyeLx = cx - rx * 0.42;
                const distEyeL = Math.hypot(x - eyeLx, y - eyeLy);
                if (distEyeL < rx * 0.26) {
                    lum = 70 + distEyeL * 3.5;
                }
                const eyeRy = cy - ry * 0.15;
                const eyeRx = cx + rx * 0.42;
                const distEyeR = Math.hypot(x - eyeRx, y - eyeRy);
                if (distEyeR < rx * 0.26) {
                    lum = 70 + distEyeR * 3.5;
                }
                // Eyebrows (dy ~ -0.32 to -0.22)
                if (dy >= -0.32 && dy <= -0.22 && ((dx >= -0.65 && dx <= -0.15) || (dx >= 0.15 && dx <= 0.65))) {
                    lum = 50;
                }
                // Nose bridge (dx ~ 0, dy between -0.15 and +0.20)
                if (Math.abs(dx) <= 0.10 && dy >= -0.15 && dy <= 0.20) {
                    lum = 220;
                }
                // Nose tip & nostrils (dy between 0.20 and 0.30)
                if (dy >= 0.20 && dy <= 0.30 && Math.abs(dx) <= 0.20) {
                    if (Math.abs(dx) >= 0.10) lum = 60; // nostrils
                    else lum = 215; // tip
                }
                // Mouth (dy between 0.40 and 0.58)
                if (dy >= 0.40 && dy <= 0.58 && Math.abs(dx) <= 0.35) {
                    if (dy >= 0.46 && dy <= 0.52) lum = 50; // lips line
                    else lum = 120; // lips
                }
                // Chin highlight (dy between 0.72 and 0.90)
                if (dy >= 0.72 && dy <= 0.90 && Math.abs(dx) <= 0.32) {
                    lum = 200;
                }

                gray[y * w + x] = Math.max(0, Math.min(255, Math.round(lum)));
            }
        }
    }
};

/**
 * Creates a realistic human face photo fixture.
 */
export const createSingleFacePhoto = async (options = {}) => {
    const { width = 400, height = 500 } = options;
    const gray = new Uint8Array(width * height);

    // Outdoor background scene
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            gray[y * width + x] = y < height * 0.65 ? 140 : 100;
        }
    }

    // Paint realistic human face
    paintNaturalFace(gray, width, height, 200, 220, 75, 95);

    return sharp(gray, { raw: { width, height, channels: 1 } }).jpeg({ quality: 90 }).toBuffer();
};

/**
 * Creates a photo fixture with 2 distinct human faces.
 */
export const createMultiFacePhoto = async () => {
    const width = 600;
    const height = 450;
    const gray = new Uint8Array(width * height);
    gray.fill(110);

    // Face 1 (Left)
    paintNaturalFace(gray, width, height, 180, 220, 60, 80);

    // Face 2 (Right)
    paintNaturalFace(gray, width, height, 430, 220, 60, 80);

    return sharp(gray, { raw: { width, height, channels: 1 } }).jpeg({ quality: 90 }).toBuffer();
};

/**
 * Creates an official document fixture with high-contrast text and tables, with NO human faces.
 */
export const createDocumentFixture = async () => {
    const svg = `
    <svg width="600" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff" />
        <rect x="20" y="20" width="560" height="760" fill="none" stroke="#334155" stroke-width="2" />
        
        <text x="300" y="60" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#0f172a">REPUBLIC OF THE PHILIPPINES</text>
        <text x="300" y="85" font-family="Arial, sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#0f172a">MUNICIPAL DISASTER RISK REDUCTION OFFICE</text>
        <text x="300" y="110" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#475569">MUNICIPALITY OF CAJIDIOCAN, SIBUYAN ISLAND</text>

        <line x1="40" y1="130" x2="560" y2="130" stroke="#0f172a" stroke-width="2" />

        <text x="50" y="170" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#0f172a">INCIDENT VERIFICATION &amp; DISPATCH REPORT</text>
        <text x="50" y="205" font-family="Arial, sans-serif" font-size="13" fill="#334155">Report Reference: SIB-2026-0823-001</text>
        <text x="50" y="235" font-family="Arial, sans-serif" font-size="13" fill="#334155">Date &amp; Time: 2026-08-23 10:30 PST</text>
        <text x="50" y="265" font-family="Arial, sans-serif" font-size="13" fill="#334155">Incident Category: Vehicular Accident / Collision</text>
        <text x="50" y="295" font-family="Arial, sans-serif" font-size="13" fill="#334155">Location: National Highway, Barangay Poblacion</text>

        <!-- Incident Table -->
        <rect x="50" y="330" width="500" height="180" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
        <line x1="50" y1="365" x2="550" y2="365" stroke="#cbd5e1" stroke-width="1" />
        <line x1="50" y1="410" x2="550" y2="410" stroke="#cbd5e1" stroke-width="1" />
        <line x1="50" y1="455" x2="550" y2="455" stroke="#cbd5e1" stroke-width="1" />

        <text x="65" y="355" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1e293b">ASSESSMENT ITEM</text>
        <text x="350" y="355" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#1e293b">STATUS / RECORD</text>

        <text x="65" y="390" font-family="Arial, sans-serif" font-size="12" fill="#334155">Casualties Recorded</text>
        <text x="350" y="390" font-family="Arial, sans-serif" font-size="12" fill="#334155">0 Fatalities, 1 Minor Injury</text>

        <text x="65" y="435" font-family="Arial, sans-serif" font-size="12" fill="#334155">Responding Unit</text>
        <text x="350" y="435" font-family="Arial, sans-serif" font-size="12" fill="#334155">BFP &amp; MDRRMO Cajidiocan</text>

        <text x="65" y="480" font-family="Arial, sans-serif" font-size="12" fill="#334155">Road Condition</text>
        <text x="350" y="480" font-family="Arial, sans-serif" font-size="12" fill="#334155">Clear / Passable</text>

        <text x="50" y="560" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">OFFICIAL ACTION LOG:</text>
        <text x="50" y="590" font-family="Arial, sans-serif" font-size="12" fill="#334155">1. Incident verified by Duty Officer on duty.</text>
        <text x="50" y="615" font-family="Arial, sans-serif" font-size="12" fill="#334155">2. Medical team dispatched with emergency kit.</text>
        <text x="50" y="640" font-family="Arial, sans-serif" font-size="12" fill="#334155">3. Scene cleared and documented for official safety record.</text>

        <text x="400" y="730" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#0f172a">CERTIFIED OFFICIAL RECORD</text>
        <line x1="320" y1="715" x2="480" y2="715" stroke="#0f172a" stroke-width="1" />
    </svg>`;

    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
};

/**
 * Creates a portrait face photo fixture with EXIF orientation metadata.
 */
export const createExifRotatedFacePhoto = async () => {
    const singleFace = await createSingleFacePhoto();
    return sharp(singleFace)
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();
};

/**
 * Creates a low-resolution compressed face photo.
 */
export const createLowResFacePhoto = async () => {
    const singleFace = await createSingleFacePhoto();
    return sharp(singleFace)
        .resize(220, 275)
        .jpeg({ quality: 60 })
        .toBuffer();
};

/**
 * Creates a dark outdoor/shadow face photo.
 */
export const createDarkFacePhoto = async () => {
    const singleFace = await createSingleFacePhoto();
    return sharp(singleFace)
        .modulate({ brightness: 0.85, saturation: 0.9 })
        .jpeg({ quality: 80 })
        .toBuffer();
};

/**
 * Creates an invalid/corrupt non-image buffer.
 */
export const createCorruptImage = () => {
    return Buffer.from('NOT_A_VALID_IMAGE_CORRUPTED_PAYLOAD_0xDEADBEEF');
};

export default {
    createSingleFacePhoto,
    createMultiFacePhoto,
    createDocumentFixture,
    createExifRotatedFacePhoto,
    createLowResFacePhoto,
    createDarkFacePhoto,
    createCorruptImage,
};
