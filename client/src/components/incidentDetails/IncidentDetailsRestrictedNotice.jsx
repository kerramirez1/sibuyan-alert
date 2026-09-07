import { HiOutlineShieldCheck } from 'react-icons/hi';

const IncidentDetailsRestrictedNotice = ({
    isOwner = false,
    className = '',
}) => {
    return (
        <div className={`mt-4 flex items-start gap-2 border-t border-gray-200/80 pt-3.5 text-xs leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400 ${className}`}>
            <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-sky-400" aria-hidden="true" />
            <p>
                {isOwner
                    ? 'This owner view keeps responder identities and internal coordination details private.'
                    : 'This is verified public safety information. Personal identities, evidence, and internal coordination details are protected.'}
            </p>
        </div>
    );
};

export default IncidentDetailsRestrictedNotice;
