import { format, formatDistanceToNow } from 'date-fns';

// The app-wide incident datetime convention: "30 Sep 2026, 10:40 PM".
// Use this everywhere a full incident timestamp is shown so Dashboard, Map,
// and report views read consistently. Relative phrasing ("2 hours ago") is
// handled separately by formatIncidentRelativeTime.
export function formatIncidentTime(dateValue, pattern = 'd MMM yyyy, h:mm a') {
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
