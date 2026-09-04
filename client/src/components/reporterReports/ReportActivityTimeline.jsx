import { formatDistanceToNow } from 'date-fns';


const UPDATE_LABELS = {
    general: 'Situation changed',
    transported: 'Patient transported',
    stabilized: 'Patient stabilized',
    need_help: 'Urgent help requested',
    false_alarm: 'Possible false alarm',
    other: 'Other update',
};

// One neutral marker for lifecycle events; red is reserved for urgent help
// requests, the only timeline event that is itself an alert.
const getDotClass = (item) => {
    if (item.type === 'reporter_update' && item.tag === 'need_help') return 'bg-red-500';
    return 'bg-gray-300';
};

const toValidDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const buildActivity = (report) => {
    const items = [];
    const submittedAt = toValidDate(report.createdAt || report.reportedAt);
    if (submittedAt) {
        items.push({ id: 'submitted', type: 'submitted', title: 'Report submitted', date: submittedAt });
    }

    const verifiedAt = toValidDate(report.verifiedAt);
    if (verifiedAt) {
        items.push({ id: 'verified', type: 'verified', title: 'Report verified', date: verifiedAt });
    }

    (report.transferHistory || []).forEach((transfer, index) => {
        const date = toValidDate(transfer.transferredAt);
        if (!date) return;
        items.push({
            id: transfer._id || `transfer-${index}`,
            type: 'transferred',
            title: `Transferred to ${transfer.toMunicipalityName || 'another municipality'}`,
            detail: transfer.reason,
            date,
        });
    });

    (report.reportUpdates || []).forEach((update, index) => {
        const date = toValidDate(update.createdAt);
        if (!date) return;
        items.push({
            id: update._id || `update-${index}`,
            type: 'reporter_update',
            tag: update.tag,
            title: UPDATE_LABELS[update.tag] || 'Situation update',
            detail: update.message,
            date,
        });
    });

    const respondedAt = toValidDate(report.respondedAt)
        || (report.responders || [])
            .map((responder) => toValidDate(responder.respondedAt))
            .filter(Boolean)
            .sort((a, b) => a - b)[0];
    if (respondedAt) {
        items.push({ id: 'responding', type: 'responding', title: 'Response started', date: respondedAt });
    }

    const resolvedAt = toValidDate(report.resolvedAt);
    if (resolvedAt) {
        items.push({
            id: 'resolved',
            type: 'resolved',
            title: 'Incident resolved',
            detail: report.resolutionNotes,
            date: resolvedAt,
        });
    }

    return items.sort((a, b) => b.date - a.date);
};

const ReportActivityTimeline = ({ report, highlightedUpdateId }) => {
    const activity = buildActivity(report);

    return (
        <ol className="mt-4 space-y-0" aria-label="Report activity timeline">
            {activity.map((item, index) => {
                const dotClass = getDotClass(item);
                const highlighted = highlightedUpdateId && String(item.id) === String(highlightedUpdateId);
                return (
                    <li key={`${item.type}-${item.id}`} className="relative flex gap-4 pb-5 last:pb-0">
                        {index < activity.length - 1 && <span className="absolute left-[9px] top-4 h-[calc(100%-1rem)] w-px bg-gray-200" aria-hidden="true" />}
                        <div className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center bg-white">
                            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                        </div>
                        <div className={`min-w-0 flex-1 ${highlighted ? 'rounded-lg bg-gray-50 p-2' : ''}`}>
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                <time dateTime={item.date.toISOString()} className="shrink-0 text-xs text-gray-500">
                                    {formatDistanceToNow(item.date, { addSuffix: true })}
                                </time>
                            </div>
                            {item.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-gray-600">{item.detail}</p>}
                            {highlighted && <p className="mt-1 text-xs font-semibold text-gray-700">Sent successfully</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};

export default ReportActivityTimeline;
