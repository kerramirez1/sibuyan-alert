import { useCallback, useEffect, useRef, useState } from 'react';
import { scanVideoFrame } from '../utils/selfieFaceDetector';

export const useSelfieFaceDetection = ({
    videoRef,
    cameraActive = false,
    onAutoCapture,
    requiredStableDurationMs = 2200,
    scanIntervalMs = 100,
    cooldownDurationMs = 2500,
    scanOptions = {},
} = {}) => {
    const [feedback, setFeedback] = useState('Position your face inside the guide');
    const [guideState, setGuideState] = useState('searching');
    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [faceCount, setFaceCount] = useState(0);
    const [isCapturing, setIsCapturing] = useState(false);

    const scratchCanvasRef = useRef(null);
    const stableStartTimeRef = useRef(null);
    const cooldownRef = useRef(false);
    const cooldownTimerRef = useRef(null);
    const isScanningRef = useRef(false);
    const activeRef = useRef(true);

    const onAutoCaptureRef = useRef(onAutoCapture);
    const isCapturingRef = useRef(isCapturing);
    const scanOptionsRef = useRef(scanOptions);
    useEffect(() => {
        onAutoCaptureRef.current = onAutoCapture;
    }, [onAutoCapture]);
    useEffect(() => {
        isCapturingRef.current = isCapturing;
    }, [isCapturing]);
    useEffect(() => {
        scanOptionsRef.current = scanOptions;
    }, [scanOptions]);

    const resetDetector = useCallback(() => {
        stableStartTimeRef.current = null;
        setStabilityProgress(0);
        setGuideState('searching');
        setFeedback('Position your face inside the guide');
        setFaceCount(0);
        setIsCapturing(false);
        if (cooldownTimerRef.current) {
            clearTimeout(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
        }
        cooldownRef.current = false;
    }, []);

    useEffect(() => {
        activeRef.current = true;
        if (!cameraActive) {
            resetDetector();
            return undefined;
        }

        if (!scratchCanvasRef.current && typeof document !== 'undefined') {
            scratchCanvasRef.current = document.createElement('canvas');
        }

        const intervalId = setInterval(async () => {
            const video = videoRef?.current;
            const scratchCanvas = scratchCanvasRef.current;

            if (!activeRef.current || isScanningRef.current || !video || !scratchCanvas) {
                return;
            }

            if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
                return;
            }

            if (cooldownRef.current || isCapturingRef.current) {
                return;
            }

            isScanningRef.current = true;
            try {
                const result = await scanVideoFrame(video, scratchCanvas, scanOptionsRef.current || {});
                if (!activeRef.current || cooldownRef.current) return;

                setFaceCount(result.faceCount ?? 0);

                if (result.valid) {
                    const now = Date.now();
                    if (!stableStartTimeRef.current) {
                        stableStartTimeRef.current = now;
                    }

                    const elapsed = now - stableStartTimeRef.current;
                    const progress = Math.min(100, Math.round((elapsed / requiredStableDurationMs) * 100));
                    setStabilityProgress(progress);

                    if (elapsed >= requiredStableDurationMs) {
                        setFeedback('Capturing…');
                        setGuideState('capturing');
                        setIsCapturing(true);
                        cooldownRef.current = true;
                        stableStartTimeRef.current = null;

                        if (typeof onAutoCaptureRef.current === 'function') {
                            onAutoCaptureRef.current();
                        }

                        cooldownTimerRef.current = setTimeout(() => {
                            cooldownRef.current = false;
                            setIsCapturing(false);
                        }, cooldownDurationMs);
                    } else {
                        setFeedback(result.message || 'Hold still');
                        setGuideState('aligned');
                    }
                } else {
                    stableStartTimeRef.current = null;
                    setStabilityProgress(0);
                    setFeedback(result.message || 'Position your face inside the guide');
                    setGuideState(result.guideState || 'searching');
                }
            } catch (error) {
                console.warn('Face detection scan error:', error);
            } finally {
                isScanningRef.current = false;
            }
        }, scanIntervalMs);

        return () => {
            activeRef.current = false;
            clearInterval(intervalId);
            if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
            }
        };
    }, [
        cameraActive,
        cooldownDurationMs,
        requiredStableDurationMs,
        resetDetector,
        scanIntervalMs,
        videoRef,
    ]);

    return {
        feedback,
        guideState,
        stabilityProgress,
        faceCount,
        isCapturing,
        resetDetector,
    };
};

export default useSelfieFaceDetection;
