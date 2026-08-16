/**
 * Safely strips known emojis and trailing exclamation marks from notification titles.
 * @param {string} title 
 * @returns {string} Cleaned title
 */
export const cleanNotificationTitle = (title) => {
    if (!title) return '';
    let cleanTitle = title;
    ['🚨', '✅', '🚑', '❌', '⚠️', '📢', '🔄', '🎉'].forEach(emoji => {
        cleanTitle = cleanTitle.replaceAll(emoji, '');
    });
    return cleanTitle.replace(/!+$/, '').trim();
};

/**
 * Cleans up duplicated phrasing in notification messages.
 * Specifically handles the "MDRRMO MDRRMO - Cajidiocan" duplication from older records.
 * @param {string} message 
 * @returns {string} Cleaned message
 */
export const cleanNotificationMessage = (message) => {
    if (!message) return '';
    return message
        .replace(/([A-Z]{3,7})\s+\1\s+-/g, '$1 -')
        .trim();
};
