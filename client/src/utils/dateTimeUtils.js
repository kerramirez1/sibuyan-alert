import { format, formatDistanceToNow } from 'date-fns';

export function formatIncidentTime(dateValue, pattern = 'MMM d, yyyy, h:mm a') {
    if (!dateValue) return 'Not available';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, pattern);
}

export function formatIncidentRelativeTime(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
}

export default { formatIncidentTime, formatIncidentRelativeTime };
