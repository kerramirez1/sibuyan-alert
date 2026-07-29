import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { highRiskZonesAPI } from '../../services/api';
import {
    HiOutlineExclamation,
    HiOutlineLocationMarker,
    HiOutlineChevronRight,
} from 'react-icons/hi';
import { MAP_FOCUS_PRESETS } from '../../utils/mapNavigation';

// Zone type colors
const ZONE_COLORS = {
    landslide_prone: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', color: '#F59E0B' },
    accident_prone: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-700', color: '#EF4444' },
    fire_risk: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', color: '#EA580C' },
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
    fire_risk: 'Fire Risk',
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
            focusRequestSequenceRef.current += 1;
            onZoneSelect({
                lat: zone.coordinates.lat,
                lng: zone.coordinates.lng,
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

            {/* Zone List */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {loading ? (
                            <div className="p-4 text-center">
                                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-sm text-gray-500 mt-2">Loading zones...</p>
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
                                        <motion.button
                                            key={zone._id}
                                            onClick={() => handleZoneClick(zone)}
                                            className={`w-full p-3 text-left hover:bg-gray-50 transition-colors flex items-start gap-3 ${typeStyle.bg}/30`}
                                            whileHover={{ x: 4 }}
                                            whileTap={{ scale: 0.98 }}
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
                                        </motion.button>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default HighRiskZoneList;
