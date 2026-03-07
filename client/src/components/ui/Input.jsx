import { forwardRef } from 'react';

const Input = forwardRef(({
    label,
    error,
    icon: Icon,
    rightElement = null,
    className = '',
    ...props
}, ref) => {
    return (
        <div className={className}>
            {label && (
                <label className="label">{label}</label>
            )}
            <div className="relative">
                {Icon && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <Icon className="w-5 h-5" />
                    </div>
                )}
                <input
                    ref={ref}
                    className={`input ${Icon ? 'pl-12' : ''} ${rightElement ? 'pr-12' : ''} ${error ? 'input-error' : ''}`}
                    {...props}
                />
                {rightElement && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                        {rightElement}
                    </div>
                )}
            </div>
            {error && (
                <p className="mt-1.5 text-sm text-danger-600">{error}</p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
