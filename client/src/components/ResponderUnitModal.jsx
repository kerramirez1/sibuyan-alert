import { useEffect, useState } from 'react';
import Modal from './ui/Modal';

const AVAILABLE_UNITS = {
    Cajidiocan: [
        { unitName: 'MDRRMO Rescue 1', unitType: 'MDRRMO' },
        { unitName: 'MDRRMO Rescue 2', unitType: 'MDRRMO' },
        { unitName: 'PNP Patrol 01', unitType: 'PNP' },
        { unitName: 'PNP Patrol 02', unitType: 'PNP' },
        { unitName: 'BFP Fire Truck 1', unitType: 'BFP' },
        { unitName: 'BFP Rescue 1', unitType: 'BFP' },
        { unitName: 'Barangay Rescue Unit', unitType: 'BARANGAY' },
        { unitName: 'Medical Response Team', unitType: 'MEDICAL' },
    ],
    Magdiwang: [
        { unitName: 'MDRRMO Rescue 1', unitType: 'MDRRMO' },
        { unitName: 'MDRRMO Rescue 2', unitType: 'MDRRMO' },
        { unitName: 'PNP Patrol 01', unitType: 'PNP' },
        { unitName: 'PNP Patrol 02', unitType: 'PNP' },
        { unitName: 'BFP Fire Truck 1', unitType: 'BFP' },
        { unitName: 'BFP Rescue 1', unitType: 'BFP' },
        { unitName: 'Barangay Rescue Unit', unitType: 'BARANGAY' },
        { unitName: 'Medical Response Team', unitType: 'MEDICAL' },
    ],
    'San Fernando': [
        { unitName: 'MDRRMO Rescue 1', unitType: 'MDRRMO' },
        { unitName: 'MDRRMO Rescue 2', unitType: 'MDRRMO' },
        { unitName: 'PNP Patrol 01', unitType: 'PNP' },
        { unitName: 'PNP Patrol 02', unitType: 'PNP' },
        { unitName: 'BFP Fire Truck 1', unitType: 'BFP' },
        { unitName: 'BFP Rescue 1', unitType: 'BFP' },
        { unitName: 'Barangay Rescue Unit', unitType: 'BARANGAY' },
        { unitName: 'Medical Response Team', unitType: 'MEDICAL' },
    ],
};

const TYPE_STYLES = {
    MDRRMO: 'border-red-200 bg-red-50 text-red-800',
    PNP: 'border-blue-200 bg-blue-50 text-blue-800',
    BFP: 'border-orange-200 bg-orange-50 text-orange-800',
    MEDICAL: 'border-violet-200 bg-violet-50 text-violet-800',
    BARANGAY: 'border-cyan-200 bg-cyan-50 text-cyan-800',
};

const ResponderUnitModal = ({ isOpen, onClose, onSelect, municipality }) => {
    const [selectedUnit, setSelectedUnit] = useState(null);
    const units = AVAILABLE_UNITS[municipality] || [];
    const groupedUnits = units.reduce((groups, unit) => ({
        ...groups,
        [unit.unitType]: [...(groups[unit.unitType] || []), unit],
    }), {});

    useEffect(() => {
        if (!isOpen) setSelectedUnit(null);
    }, [isOpen]);

    const handleClose = () => {
        setSelectedUnit(null);
        onClose();
    };

    const handleConfirm = () => {
        if (!selectedUnit) return;
        onSelect(selectedUnit);
        setSelectedUnit(null);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Select responding unit" size="lg">
            <p className="text-sm text-gray-600">
                {municipality
                    ? `Choose the ${municipality} unit that will respond to this incident.`
                    : 'A municipality assignment is required before selecting a response unit.'}
            </p>

            {units.length === 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                    No responder units are configured for this municipality.
                </div>
            ) : (
                <div className="mt-5 max-h-[52vh] space-y-5 overflow-y-auto pr-1">
                    {Object.entries(groupedUnits).map(([type, typeUnits]) => (
                        <fieldset key={type}>
                            <legend className="text-xs font-bold uppercase tracking-wider text-gray-500">{type}</legend>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {typeUnits.map((unit) => {
                                    const selected = selectedUnit?.unitName === unit.unitName;
                                    return (
                                        <button
                                            key={unit.unitName}
                                            type="button"
                                            onClick={() => setSelectedUnit(unit)}
                                            aria-pressed={selected}
                                            className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${selected ? TYPE_STYLES[type] || 'border-gray-400 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            {unit.unitName}
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>
                    ))}
                </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2 border-t border-gray-200 pt-4 min-[360px]:grid-cols-2">
                <button
                    type="button"
                    onClick={handleClose}
                    className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!selectedUnit}
                    className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Confirm response
                </button>
            </div>
        </Modal>
    );
};

export default ResponderUnitModal;
