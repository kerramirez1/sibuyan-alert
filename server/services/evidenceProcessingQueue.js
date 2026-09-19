/**
 * The queue that runs evidence image analysis off the request path.
 *
 * Why it exists: a report submission used to await full face detection and
 * redaction for every photo before answering 201. Measured on a 1200x900 JPEG
 * (exactly what the client sends after its own compression), one photo cost
 * ~10s and a phone photo with EXIF rotation ~18-24s, so a five-photo report
 * could hold the request for ~90s — past Heroku's 30s router timeout, and past
 * the client's own 60s submit timeout.
 *
 * Concurrency is 1 on purpose. The detector is synchronous JavaScript on the
 * main thread, so extra concurrency buys no parallelism: it only multiplies the
 * memory held by in-flight photos and lets one report's analysis interleave with
 * another's. One at a time keeps each freeze bounded and the queue order fair.
 */
import { createBackgroundTaskQueue } from './backgroundTaskQueue.js';

export const EVIDENCE_PROCESSING_CONCURRENCY = 1;

export const evidenceProcessingQueue = createBackgroundTaskQueue({
    name: 'evidence-derivative',
    concurrency: EVIDENCE_PROCESSING_CONCURRENCY,
    onError: (error) => {
        // Never fatal: the metadata is a label on the public projection, and
        // publicReport already renders an evidence item as "processing" while
        // it is absent.
        console.error('Background evidence processing failed:', error?.message || error);
    },
});

export default evidenceProcessingQueue;
