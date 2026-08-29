import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useSelfieFaceDetection } from '../hooks/useSelfieFaceDetection';
import * as detectorUtils from '../utils/selfieFaceDetector';

describe('useSelfieFaceDetection hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    const advanceTimeAndFlush = async (ms, step = 100) => {
        let remaining = ms;
        while (remaining > 0) {
            const delta = Math.min(step, remaining);
            await act(async () => {
                vi.advanceTimersByTime(delta);
                await Promise.resolve();
            });
            remaining -= delta;
        }
    };

    test('initializes with default guidance state', () => {
        const videoRef = { current: null };
        const { result } = renderHook(() =>
            useSelfieFaceDetection({
                videoRef,
                cameraActive: false,
                onAutoCapture: vi.fn(),
            })
        );

        expect(result.current.guideState).toBe('searching');
        expect(result.current.stabilityProgress).toBe(0);
        expect(result.current.feedback).toBe('Position your face inside the guide');
    });

    test('triggers onAutoCapture after face remains stable for required duration', async () => {
        const onAutoCapture = vi.fn();
        const fakeVideo = {
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
        };
        const videoRef = { current: fakeVideo };

        // Mock scanVideoFrame to return valid centered face
        vi.spyOn(detectorUtils, 'scanVideoFrame').mockResolvedValue({
            status: 'valid_face',
            message: 'Hold still',
            guideState: 'aligned',
            valid: true,
            faceCount: 1,
            face: { x: 220, y: 130, width: 200, height: 200 },
        });

        const { result } = renderHook(() =>
            useSelfieFaceDetection({
                videoRef,
                cameraActive: true,
                onAutoCapture,
                requiredStableDurationMs: 300,
                scanIntervalMs: 100,
            })
        );

        // Advance timer for first scan interval
        await advanceTimeAndFlush(100);

        expect(result.current.guideState).toBe('aligned');
        expect(result.current.feedback).toMatch(/Hold still/i);

        // Advance timer past required duration (300ms)
        await advanceTimeAndFlush(300);

        expect(onAutoCapture).toHaveBeenCalledTimes(1);
        expect(result.current.guideState).toBe('capturing');
        expect(result.current.feedback).toMatch(/capturing/i);
    });

    test('does not auto-capture when no face is detected', async () => {
        const onAutoCapture = vi.fn();
        const fakeVideo = {
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
        };
        const videoRef = { current: fakeVideo };

        vi.spyOn(detectorUtils, 'scanVideoFrame').mockResolvedValue({
            status: 'no_face',
            message: 'No face detected',
            guideState: 'searching',
            valid: false,
            faceCount: 0,
        });

        const { result } = renderHook(() =>
            useSelfieFaceDetection({
                videoRef,
                cameraActive: true,
                onAutoCapture,
                requiredStableDurationMs: 300,
                scanIntervalMs: 100,
            })
        );

        await advanceTimeAndFlush(400);

        expect(onAutoCapture).not.toHaveBeenCalled();
        expect(result.current.guideState).toBe('searching');
        expect(result.current.feedback).toBe('No face detected');
        expect(result.current.stabilityProgress).toBe(0);
    });

    test('does not auto-capture and shows warning when multiple faces are detected', async () => {
        const onAutoCapture = vi.fn();
        const fakeVideo = {
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
        };
        const videoRef = { current: fakeVideo };

        vi.spyOn(detectorUtils, 'scanVideoFrame').mockResolvedValue({
            status: 'multiple_faces',
            message: 'Make sure only one person is visible',
            guideState: 'warning',
            valid: false,
            faceCount: 2,
        });

        const { result } = renderHook(() =>
            useSelfieFaceDetection({
                videoRef,
                cameraActive: true,
                onAutoCapture,
                requiredStableDurationMs: 300,
                scanIntervalMs: 100,
            })
        );

        await advanceTimeAndFlush(400);

        expect(onAutoCapture).not.toHaveBeenCalled();
        expect(result.current.guideState).toBe('warning');
        expect(result.current.feedback).toBe('Make sure only one person is visible');
        expect(result.current.faceCount).toBe(2);
    });

    test('resets countdown progress if face is lost mid-countdown', async () => {
        const onAutoCapture = vi.fn();
        const fakeVideo = {
            readyState: 4,
            videoWidth: 640,
            videoHeight: 480,
        };
        const videoRef = { current: fakeVideo };

        const scanSpy = vi.spyOn(detectorUtils, 'scanVideoFrame');

        // Valid on first frame
        scanSpy.mockResolvedValueOnce({
            status: 'valid_face',
            message: 'Hold still',
            guideState: 'aligned',
            valid: true,
            faceCount: 1,
        });

        const { result } = renderHook(() =>
            useSelfieFaceDetection({
                videoRef,
                cameraActive: true,
                onAutoCapture,
                requiredStableDurationMs: 300,
                scanIntervalMs: 100,
            })
        );

        await advanceTimeAndFlush(100);
        expect(result.current.guideState).toBe('aligned');

        // Lost on next frame
        scanSpy.mockResolvedValueOnce({
            status: 'not_centered',
            message: 'Center your face',
            guideState: 'warning',
            valid: false,
            faceCount: 1,
        });

        await advanceTimeAndFlush(100);

        expect(result.current.guideState).toBe('warning');
        expect(result.current.feedback).toBe('Center your face');
        expect(result.current.stabilityProgress).toBe(0);
        expect(onAutoCapture).not.toHaveBeenCalled();
    });
});
