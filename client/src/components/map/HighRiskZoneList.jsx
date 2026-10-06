import { useState, useEffect, useRef } from 'react';
import { highRiskZonesAPI } from '../../services/api';
import {
    HiOutlineExclamation,
    HiOutlineLocationMarker,
    HiOutlineChevronRight,
} from 'react-icons/hi';
import { SkeletonRow } from '../ui/Skeleton';
import { MAP_FOCUS_PRESETS } from '../../utils/mapNavigation';

// Zone type colors
const ZONE_COLORS = {
    landslide_prone: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', color: '#F59E0B' },
    accident_prone: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700', color: '#EF4444' },
    flood_prone: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', color: '#3B82F6' },
    other: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700', color: '#6B7280' },
};

const SEVERITY_STYLES = {
    low: { label: 'Low', color: 'bg-green-500' },
    medium: { label: 'Medium', color: 'bg-yellow-500' },
    high: { label: 'High', color: 'bg-orange-500' },
    critical: { label: 'Critical', color: 'bg-red-600' },
};

const ZONE_LABELS = {
    landslide_prone: 'Landslide Prone',
    accident_prone: 'Accident Prone',
    flood_prone: 'Flood Prone',
    other: 'Other Hazard',
};

const HighRiskZoneList = ({ onZoneSelect, isExpanded = true }) => {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isOpen, setIsOpen] = useState(isExpanded);
    const focusRequestSequenceRef = useRef(0);

    useEffect(() => {
        const fetchZones = async () => {
            setLoading(true);
            try {
                const response = await highRiskZonesAPI.getAll();
                setZones(response.data.data || []);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch high-risk zones:', err);
                setError('Failed to load high-risk zones');
            } finally {
                setLoading(false);
            }
        };

        fetchZones();
    }, []);

    const handleZoneClick = (zone) => {
        if (onZoneSelect) {
            // P2-8: coordinate-less rows must not throw in the click handler —
            // skip the focus and still pass the zone through.
            const coordinates = zone?.coordinates;
            focusRequestSequenceRef.current += 1;
            onZoneSelect({
                ...(coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : {}),
                ...MAP_FOCUS_PRESETS.list,
                requestId: `${Date.now()}-${focusRequestSequenceRef.current}`,
                zone,
            });
        }
    };

    if (zones.length === 0 && !loading) {
        return null;
    }

    return (
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-2 bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 transition-all"
            >
                <div className="flex items-center gap-2">
                    <HiOutlineExclamation className="w-4 h-4" />
                    <span className="font-semibold text-xs">High-Risk Zones</span>
                </div>
                <HiOutlineChevronRight
                    className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
            </button>

            {/* Zone List: the grid-rows trick animates height without JS.
                Collapsed content also leaves the tab order (invisible flips
                at the end of the transition). */}
            <div
                className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible'}`}
            >
                <div className="overflow-hidden min-h-0">
                    {loading ? (
                        <div className="divide-y divide-gray-100 dark:divide-white/5" role="status" aria-busy="true" aria-label="Loading risk zones">
                            <span className="sr-only">Loading risk zones</span>
                            {[0, 1, 2].map((i) => (
                                <SkeletonRow key={i} lines={2} className="p-3" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="p-4 text-center text-red-500 text-sm">
                            {error}
                        </div>
                    ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                            {zones.map((zone) => {
                                const typeStyle = ZONE_COLORS[zone.type] || ZONE_COLORS.other;
                                const severityStyle = SEVERITY_STYLES[zone.severity] || SEVERITY_STYLES.medium;

                                return (
                                    <button
                                        key={zone._id}
                                        onClick={() => handleZoneClick(zone)}
                                        className={`w-full p-3 text-left hover:bg-gray-50 hover:translate-x-1 active:scale-[0.98] transition-[color,background-color,transform] flex items-start gap-3 ${typeStyle.bg}/30`}
                                    >
                                        <div
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeStyle.bg} ${typeStyle.border} border`}
                                        >
                                            <HiOutlineLocationMarker className={`w-5 h-5 ${typeStyle.text}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="font-medium text-gray-900 truncate">
                                                    {zone.name}
                                                </h4>
                                                <span
                                                    className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium text-white rounded-full ${severityStyle.color}`}
                                                >
                                                    {severityStyle.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {ZONE_LABELS[zone.type] || ZONE_LABELS.other} • {zone.municipality}
                                            </p>
                                            {zone.description && (
                                                <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                                                    {zone.description}
                                                </p>
                                            )}
                                        </div>
                                        <HiOutlineChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-3" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HighRiskZoneList;
