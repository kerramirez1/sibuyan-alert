export const isGridFsAsset = (value) =>
    typeof value === 'string' && (
        /\/api\/files\/[a-f\d]{24}(?:\/|$)/i.test(value)
        || /^[a-f\d]{24}$/i.test(value.trim())
    );

export const toApiFilePath = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
        return `/files/${trimmed}`;
    }
    let path;
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            path = new URL(trimmed).pathname;
        } catch {
            return trimmed;
        }
    } else {
        path = trimmed.split('?')[0];
    }
    if (/^[0-9a-fA-F]{24}$/.test(path)) {
        return `/files/${path}`;
    }
    return path.startsWith('/api/') ? path.slice('/api'.length) : path;
};

export const resolveAssetUrl = (value) => {
    if (!value || /^(https?:|blob:|data:)/i.test(value)) return value || null;

    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    if (!apiBase) return value.startsWith('/') ? value : `/${value}`;

    let assetOrigin = apiBase;
    if (assetOrigin.endsWith('/api') && value.startsWith('/api/')) {
        assetOrigin = assetOrigin.slice(0, -'/api'.length);
    }
    return `${assetOrigin}${value.startsWith('/') ? '' : '/'}${value}`;
};
