export const isGridFsAsset = (value) =>
    typeof value === 'string' && /\/api\/files\/[a-f\d]{24}(?:\/|$)/i.test(value);

export const toApiFilePath = (value) => {
    if (typeof value !== 'string') return value;
    const path = /^https?:\/\//i.test(value)
        ? new URL(value).pathname
        : value.split('?')[0];
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
