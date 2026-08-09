import { HiOutlineExternalLink, HiOutlineMail, HiOutlineShieldCheck } from 'react-icons/hi';
import { LEGAL_CONFIG, LEGAL_DOCUMENTS } from '../../config/legal';
import Modal from '../ui/Modal';

const LegalDocumentModal = ({ documentType, isOpen, onClose }) => {
    const document = LEGAL_DOCUMENTS[documentType];

    if (!document) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={document.title}
            size="2xl"
        >
            <article className="space-y-7 text-sm leading-6 text-gray-600 dark:text-gray-300">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <div className="mb-2 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                        <HiOutlineShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <p className="font-bold">Effective {document.effectiveDate}</p>
                    </div>
                    <p>{document.intro}</p>
                </div>

                {document.sections.map((section) => (
                    <section key={section.title} aria-labelledby={`${documentType}-${section.title.split('.')[0]}`}>
                        <h3
                            id={`${documentType}-${section.title.split('.')[0]}`}
                            className="mb-2 text-base font-bold text-gray-950 dark:text-white"
                        >
                            {section.title}
                        </h3>

                        {section.paragraphs?.map((paragraph) => (
                            <p key={paragraph} className="mb-3 last:mb-0">{paragraph}</p>
                        ))}

                        {section.items && (
                            <ul className="list-disc space-y-2 pl-5 marker:text-emerald-600" role="list">
                                {section.items.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        )}

                        {section.links && (
                            <ul className="mt-3 space-y-2" aria-label="Official privacy references">
                                {section.links.map((link) => (
                                    <li key={link.href}>
                                        <a
                                            href={link.href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
                                        >
                                            {link.label}
                                            <HiOutlineExternalLink className="h-4 w-4" aria-hidden="true" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                ))}

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="mb-1 font-bold text-gray-950 dark:text-white">Contact</p>
                    <p>{LEGAL_CONFIG.operatorName}</p>
                    <p>{LEGAL_CONFIG.operatorAddress}</p>
                    <a
                        href={`mailto:${LEGAL_CONFIG.privacyEmail}`}
                        className="mt-2 inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
                    >
                        <HiOutlineMail className="h-4 w-4" aria-hidden="true" />
                        {LEGAL_CONFIG.privacyEmail}
                    </a>
                </div>
            </article>
        </Modal>
    );
};

export default LegalDocumentModal;

