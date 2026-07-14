/**
 * Schedules one-message moderation requests for the background worker.
 *
 * This class accepts normalized Message objects only. It deliberately does
 * not query Messenger DOM or call the LLM endpoint directly; the background
 * worker remains the extension's backend boundary.
 */
class MessageProcessor {

    static PRIORITY = Object.freeze({
        INITIAL_SCAN: 0,
        LIVE_MESSAGE: 1
    });

    static DEFAULT_MAX_PENDING = 25;
    static DEFAULT_CONCURRENCY = 1;

    constructor({
        maxPending = MessageProcessor.DEFAULT_MAX_PENDING,
        concurrency = MessageProcessor.DEFAULT_CONCURRENCY,
        onResult = null,
        onExplanation = null,
        onExplanationError = null,
        onError = null,
        onDropped = null
    } = {}) {
        if (!Number.isInteger(maxPending) || maxPending < 1) {
            throw new TypeError("maxPending must be a positive integer.");
        }

        if (!Number.isInteger(concurrency) || concurrency < 1) {
            throw new TypeError("concurrency must be a positive integer.");
        }

        this.maxPending = maxPending;
        this.concurrency = concurrency;
        this.onResult = onResult;
        this.onExplanation = onExplanation;
        this.onExplanationError = onExplanationError;
        this.onError = onError;
        this.onDropped = onDropped;
        this.queue = [];
        this.queuedIds = new Set();
        this.activeIds = new Set();
        this.activeCount = 0;
        this.sequence = 0;
        this.stopped = false;
    }

    /**
     * Adds one independent message for moderation.
     *
     * Live messages preempt pending initial-scan work when the bounded queue
     * is full. Messages are never combined into one model prompt.
     *
     * @param {Message} message
     * @param {{priority?: number, context?: string}} options
     * @returns {boolean} Whether the message was accepted for processing.
     */
    enqueue(message, {
        priority = MessageProcessor.PRIORITY.INITIAL_SCAN,
        context = "main"
    } = {}) {
        if (this.stopped || !message?.id || !message?.text) {
            return false;
        }

        if (this.queuedIds.has(message.id) || this.activeIds.has(message.id)) {
            return false;
        }

        const job = {
            message,
            priority,
            context,
            sequence: this.sequence++
        };

        if (this.queue.length >= this.maxPending) {
            const preemptedIndex = this.findPreemptibleJobIndex(job);

            if (preemptedIndex === -1) {
                this.notifyDropped(job, "queue_full");
                return false;
            }

            const [preemptedJob] = this.queue.splice(preemptedIndex, 1);
            this.queuedIds.delete(preemptedJob.message.id);
            this.notifyDropped(preemptedJob, "preempted_by_live_message");
        }

        this.queue.push(job);
        this.queuedIds.add(message.id);
        void this.drain();

        return true;
    }

    stop() {
        this.stopped = true;

        for (const job of this.queue) {
            this.notifyDropped(job, "processor_stopped");
        }

        this.queue = [];
        this.queuedIds.clear();
    }

    get pendingCount() {
        return this.queue.length;
    }

    /** @private */
    async drain() {
        while (!this.stopped && this.activeCount < this.concurrency) {
            const job = this.takeNextJob();

            if (!job) {
                return;
            }

            this.activeCount += 1;
            this.activeIds.add(job.message.id);
            void this.execute(job);
        }
    }

    /** @private */
    async execute(job) {
        try {
            const result = await this.requestAnalysis(job);
            await this.onResult?.(job.message, result);

            if (result.shouldBlock === true) {
                await this.generateExplanation(job, result);
            }
        } catch (error) {
            console.error("[BantAI] Message analysis failed:", error);
            this.onError?.(job.message, error);
        } finally {
            this.activeCount -= 1;
            this.activeIds.delete(job.message.id);
            void this.drain();
        }
    }

    /** @private */
    requestAnalysis(job) {
        return this.sendRuntimeMessage({
            action: "analyzeMessage",
            text: job.message.text,
            messageId: job.message.id,
            context: job.context
        }, "Background worker returned no analysis response.");
    }

    /** @private */
    async generateExplanation(job, analysisResult) {
        try {
            const response = await this.sendRuntimeMessage({
                action: "explainMessage",
                text: job.message.text,
                verdict: analysisResult.details
            }, "Background worker returned no explanation response.");

            const explanation = response?.explanation;

            if (!explanation?.childComment) {
                throw new Error("Background worker returned an invalid explanation.");
            }

            this.onExplanation?.(job.message, explanation, analysisResult);
        } catch (error) {
            console.warn("[BantAI] Educational explanation unavailable:", error);
            this.onExplanationError?.(job.message, error, analysisResult);
        }
    }

    /** @private */
    sendRuntimeMessage(request, emptyResponseError) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(request, response => {
                const runtimeError = chrome.runtime.lastError;

                if (runtimeError) {
                    reject(new Error(runtimeError.message));
                    return;
                }

                if (!response) {
                    reject(new Error(emptyResponseError));
                    return;
                }

                resolve(response);
            });
        });
    }

    /** @private */
    takeNextJob() {
        if (!this.queue.length) {
            return null;
        }

        const nextIndex = this.queue.reduce((bestIndex, job, index, jobs) => {
            const bestJob = jobs[bestIndex];

            if (job.priority > bestJob.priority) {
                return index;
            }

            if (job.priority === bestJob.priority && job.sequence < bestJob.sequence) {
                return index;
            }

            return bestIndex;
        }, 0);
        const [job] = this.queue.splice(nextIndex, 1);
        this.queuedIds.delete(job.message.id);

        return job;
    }

    /** @private */
    findPreemptibleJobIndex(incomingJob) {
        if (incomingJob.priority !== MessageProcessor.PRIORITY.LIVE_MESSAGE) {
            return -1;
        }

        const initialScanIndex = this.queue.findIndex(job =>
            job.priority === MessageProcessor.PRIORITY.INITIAL_SCAN
        );

        if (initialScanIndex !== -1) {
            return initialScanIndex;
        }

        return this.queue.reduce((oldestIndex, job, index, jobs) => {
            return job.sequence < jobs[oldestIndex].sequence
                ? index
                : oldestIndex;
        }, 0);
    }

    /** @private */
    notifyDropped(job, reason) {
        this.onDropped?.(job.message, reason);
    }
}
