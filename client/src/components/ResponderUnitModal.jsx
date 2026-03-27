import { useState } from 'react';
import PropTypes from 'prop-types';
import '../index.css';

const ResponderUnitModal = ({ isOpen, onClose, onSelect, municipality }) => {
    const [selectedUnit, setSelectedUnit] = useState(null);

    // Available units per municipality
    const availableUnits = {
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

    const units = availableUnits[municipality] || [];

    // Group units by type for better UI
    const groupedUnits = units.reduce((acc, unit) => {
        if (!acc[unit.unitType]) {
            acc[unit.unitType] = [];
        }
        acc[unit.unitType].push(unit);
        return acc;
    }, {});

    const handleSelect = () => {
        if (selectedUnit) {
            onSelect(selectedUnit);
            setSelectedUnit(null);
            onClose();
        }
    };

    const handleCancel = () => {
        setSelectedUnit(null);
        onClose();
    };

    if (!isOpen) return null;

    // Unit type icons and colors
    const unitStyles = {
        MDRRMO: { color: '#dc2626', bg: '#fee2e2' },
        PNP: { color: '#2563eb', bg: '#dbeafe' },
        BFP: { color: '#ea580c', bg: '#fed7aa' },
        RESCUE: { color: '#16a34a', bg: '#dcfce7' },
        MEDICAL: { color: '#7c3aed', bg: '#ede9fe' },
        BARANGAY: { color: '#0891b2', bg: '#cffafe' },
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '1rem',
            }}
            onClick={handleCancel}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '1.5rem',
                        borderBottom: '1px solid #e5e7eb',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        color: 'white',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
                        Select Your Responding Unit
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', opacity: 0.95 }}>
                        {municipality} - Choose the unit responding to this incident
                    </p>
                </div>

                {/* Content */}
                <div
                    style={{
                        padding: '1.5rem',
                        overflowY: 'auto',
                        flex: 1,
                    }}
                >
                    {Object.entries(groupedUnits).map(([type, typeUnits]) => {
                        const style = unitStyles[type] || { color: '#6b7280', bg: '#f3f4f6' };

                        return (
                            <div key={type} style={{ marginBottom: '1.5rem' }}>
                                <h3
                                    style={{
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        color: '#6b7280',
                                        marginBottom: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            display: 'inline-block',
                                            width: '0.625rem',
                                            height: '0.625rem',
                                            borderRadius: '9999px',
                                            backgroundColor: style.color,
                                            marginRight: '0.5rem',
                                            verticalAlign: 'middle',
                                        }}
                                    />
                                    {type}
                                </h3>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                                        gap: '0.75rem',
                                    }}
                                >
                                    {typeUnits.map((unit) => {
                                        const isSelected = selectedUnit?.unitName === unit.unitName;

                                        return (
                                            <button
                                                key={unit.unitName}
                                                onClick={() => setSelectedUnit(unit)}
                                                style={{
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    border: isSelected
                                                        ? `3px solid ${style.color}`
                                                        : '2px solid #e5e7eb',
                                                    backgroundColor: isSelected ? style.bg : 'white',
                                                    color: isSelected ? style.color : '#1f2937',
                                                    fontWeight: isSelected ? '600' : '500',
                                                    fontSize: '1rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    textAlign: 'left',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = style.color;
                                                        e.currentTarget.style.backgroundColor = style.bg;
                                                        e.currentTarget.style.transform = 'scale(1.02)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = '#e5e7eb';
                                                        e.currentTarget.style.backgroundColor = 'white';
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                    }
                                                }}
                                            >
                                                {isSelected && (
                                                    <span
                                                        aria-hidden="true"
                                                        style={{
                                                            width: '0.875rem',
                                                            height: '0.875rem',
                                                            borderRadius: '9999px',
                                                            backgroundColor: style.color,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                )}
                                                <span>{unit.unitName}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '1.5rem',
                        borderTop: '1px solid #e5e7eb',
                        display: 'flex',
                        gap: '1rem',
                        backgroundColor: '#f9fafb',
                    }}
                >
                    <button
                        onClick={handleCancel}
                        style={{
                            flex: 1,
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            border: '2px solid #e5e7eb',
                            backgroundColor: 'white',
                            color: '#6b7280',
                            fontWeight: '600',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSelect}
                        disabled={!selectedUnit}
                        style={{
                            flex: 2,
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: selectedUnit ? '#3b82f6' : '#9ca3af',
                            color: 'white',
                            fontWeight: '700',
                            fontSize: '1rem',
                            cursor: selectedUnit ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s ease',
                            opacity: selectedUnit ? 1 : 0.6,
                        }}
                        onMouseEnter={(e) => {
                            if (selectedUnit) {
                                e.currentTarget.style.backgroundColor = '#2563eb';
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (selectedUnit) {
                                e.currentTarget.style.backgroundColor = '#3b82f6';
                                e.currentTarget.style.transform = 'scale(1)';
                            }
                        }}
                    >
                        Confirm & Respond
                    </button>
                </div>
            </div>
        </div>
    );
};

ResponderUnitModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    municipality: PropTypes.string.isRequired,
};

export default ResponderUnitModal;
