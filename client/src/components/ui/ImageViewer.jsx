import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiDownload } from 'react-icons/hi';
import { useEffect } from 'react';

const ImageViewer = ({ isOpen, onClose, imageSrc, alt = 'Image' }) => {
    // Simple state could be used for zoom, but for now let's just make it a big modal
    // If user wants more details, a simple full-screen overlay is usually best.

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0"
                        onClick={onClose}
                    />

                    {/* Controls */}
                    <div className="absolute top-4 right-4 z-[70] flex gap-3">
                        <a
                            href={imageSrc}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
                            title="Open Original"
                            aria-label="Open original image"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <HiDownload className="w-6 h-6" />
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
                            aria-label="Close image viewer"
                        >
                            <HiX className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Image Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative z-[65] max-w-full max-h-full overflow-auto flex items-center justify-center p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={imageSrc}
                            alt={alt}
                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ImageViewer;
