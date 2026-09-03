import { format, formatDistanceToNow } from 'date-fns';

export function formatIncidentTime(dateValue, pattern = 'MMM d, yyyy, h:mm a') {
    if (!dateValue) return 'Not available';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, pattern);
}

export function formatIncidentRelativeTime(dateValue, fallback = '') {
    if (!dateValue) return fallback;
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? fallback : formatDistanceToNow(date, { addSuffix: true });
}

export default { formatIncidentTime, formatIncidentRelativeTime };
