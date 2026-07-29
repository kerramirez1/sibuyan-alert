import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineBadgeCheck,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi';

const UPDATE_LABELS = {
    general: 'Situation changed',
    transported: 'Patient transported',
    stabilized: 'Patient stabilized',
    need_help: 'Urgent help requested',
    false_alarm: 'Possible false alarm',
    other: 'Other update',
};

const TYPE_CONFIG = {
    submitted: { icon: HiOutlineClipboardList, iconClass: 'bg-gray-100 text-gray-600' },
    verified: { icon: HiOutlineCheckCircle, iconClass: 'bg-blue-50 text-blue-600' },
    transferred: { icon: HiOutlineSwitchHorizontal, iconClass: 'bg-violet-50 text-violet-600' },
    responding: { icon: HiOutlineLightningBolt, iconClass: 'bg-indigo-50 text-indigo-600' },
    resolved: { icon: HiOutlineBadgeCheck, iconClass: 'bg-emerald-50 text-emerald-600' },
    reporter_update: { icon: HiOutlineLocationMarker, iconClass: 'bg-brand-50 text-brand-700' },
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
                const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.submitted;
                const Icon = config.icon;
                const highlighted = highlightedUpdateId && String(item.id) === String(highlightedUpdateId);
                return (
                    <li key={`${item.type}-${item.id}`} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < activity.length - 1 && <span className="absolute left-4 top-8 h-[calc(100%-1rem)] w-px bg-gray-200" aria-hidden="true" />}
                        <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.iconClass}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className={`min-w-0 flex-1 rounded-lg px-1 py-1 ${highlighted ? 'bg-brand-50 ring-2 ring-brand-500/15' : ''}`}>
                            <div className="flex flex-col gap-0.5 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3">
                                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                <time dateTime={item.date.toISOString()} className="shrink-0 text-xs text-gray-500">
                                    {formatDistanceToNow(item.date, { addSuffix: true })}
                                </time>
                            </div>
                            {item.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-gray-600">{item.detail}</p>}
                            {highlighted && <p className="mt-1 text-xs font-semibold text-brand-700">Sent successfully</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};

export default ReportActivityTimeline;
