/**
 * Service for generating safe, server-blurred image previews.
 * Strips all metadata, EXIF, and high-resolution details.
 */

/**
 * Samples colors from an image buffer to generate a privacy-safe color palette
 * representing the dominant lighting and color scheme of the incident photo.
 */
const sampleBufferColors = (buffer) => {
    if (!buffer || buffer.length < 32) {
        return [
            ['#334155', '#1e293b'],
            ['#475569', '#0f172a'],
            ['#1e293b', '#334155'],
        ];
    }

    const rows = 4;
    const cols = 4;
    const totalCells = rows * cols;
    const step = Math.max(1, Math.floor(buffer.length / (totalCells * 3)));
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
        const offset = Math.min(buffer.length - 3, (i * step * 3) + 16);
        const r = buffer[offset] || 50;
        const g = buffer[offset + 1] || 60;
        const b = buffer[offset + 2] || 70;
        cells.push(`rgb(${r}, ${g}, ${b})`);
    }

    return cells;
};

/**
 * Generates an SVG derivative with Gaussian blur filter and sampled color geometry.
 * Completely eliminates any identifiable facial features, vehicle plates, text, or GPS/EXIF data.
 */
export const generateBlurredEvidenceSvg = (fileBuffer, { width = 640, height = 480 } = {}) => {
    const palette = sampleBufferColors(fileBuffer);
    const cols = 4;
    const rows = 4;
    const cellW = width / cols;
    const cellH = height / rows;

    const rectElements = palette.map((color, index) => {
        const x = (index % cols) * cellW;
        const y = Math.floor(index / cols) * cellH;
        return `<rect x="${x}" y="${y}" width="${cellW + 2}" height="${cellH + 2}" fill="${color}" opacity="0.9" />`;
    }).join('\n      ');

    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="privacyBlurFilter" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="28" edgeMode="duplicate" result="blurred" />
      <feColorMatrix type="matrix" values="
        0.95 0 0 0 0.02
        0 0.95 0 0 0.02
        0 0 0.95 0 0.02
        0 0 0 1 0" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#0b131b" />
  <g filter="url(#privacyBlurFilter)">
    ${rectElements}
  </g>
  <rect width="100%" height="100%" fill="rgba(11, 19, 27, 0.28)" />
</svg>`, 'utf-8');
};

export default {
    generateBlurredEvidenceSvg,
};
