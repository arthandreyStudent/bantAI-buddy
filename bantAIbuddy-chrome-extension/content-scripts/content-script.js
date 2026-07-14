/**
 * Extension supervisor. It coordinates lifecycle and processing only; DOM
 * knowledge remains inside MessengerDOM and observer responsibilities stay
 * separated between application navigation and conversation updates.
 */
class BantAIBuddySupervisor {

    constructor() {
        this.cacheManager = new CacheManager();
        this.messageProcessor = new MessageProcessor({
            onResult: (message, result) => this.handleAnalysisResult(message, result),
            onExplanation: (message, explanation, result) =>
                this.handleExplanation(message, explanation, result),
            onExplanationError: (message, error, result) =>
                this.handleExplanationError(message, error, result),
            onError: (message, error) => this.handleAnalysisError(message, error),
            onDropped: (message, reason) => this.handleDroppedMessage(message, reason)
        });
        this.applicationObserver = new ApplicationObserver();
        this.conversationObserver = new ConversationObserver(
            message => this.processMessage(
                message,
                MessageProcessor.PRIORITY.LIVE_MESSAGE
            )
        );
    }

    async init() {
        console.log("[BantAI] Initializing...");
        await this.cacheManager.ready;
        this.applicationObserver.onConversationChanged(
            container => this.handleConversationChanged(container)
        );
        this.applicationObserver.start();
    }

    handleConversationChanged(container) {
        this.conversationObserver.observe(container);

        if (!container) {
            return;
        }

        const diagnostics = MessengerDOM.getMessageDiagnostics(container);
        const messages = MessengerDOM.getAllMessages(container);
        console.log("[BantAI] Conversation scan:", diagnostics);
        messages.forEach(message => this.processMessage(
            message,
            MessageProcessor.PRIORITY.INITIAL_SCAN
        ));
    }

    /** Main processing pipeline. */
    processMessage(message, priority) {
        if (!MessengerDOM.isValidMessage(message)) {
            return;
        }

        if (!this.cacheManager.claim(message)) {
            if (this.cacheManager.isBlocked(message)) {
                BlurManager.blur(message);
            }
            console.log("[BantAI] Skipping already analyzed message:", message.id);
            return;
        }

        console.log("[BantAI] Message detected:", message);

        const accepted = this.messageProcessor.enqueue(message, { priority });

        if (!accepted) {
            this.cacheManager.forget(message);
        }
    }

    async handleAnalysisResult(message, result) {
        console.log("[BantAI] Message analysis completed:", {
            messageId: message.id,
            shouldBlock: result.shouldBlock,
            analysis: result.details
        });

        if (result.shouldBlock === true) {
            BlurManager.blur(message);
        }

        await this.cacheManager.markAnalyzed(message, result.shouldBlock);
    }

    handleAnalysisError(message, error) {
        this.cacheManager.forget(message);
        console.warn("[BantAI] Message analysis unavailable:", {
            messageId: message.id,
            error: error.message
        });
    }

    handleExplanation(message, explanation, result) {
        console.log("[BantAI] Educational explanation completed:", {
            messageId: message.id,
            childComment: explanation.childComment,
            analysis: result.details
        });

        PopupManager.show(explanation);
    }

    handleExplanationError(message, error, result) {
        console.warn("[BantAI] Educational explanation unavailable:", {
            messageId: message.id,
            error: error.message,
            analysis: result.details
        });
    }

    handleDroppedMessage(message, reason) {
        this.cacheManager.forget(message);
        console.warn("[BantAI] Message processing deferred:", {
            messageId: message.id,
            reason
        });
    }

    destroy() {
        this.conversationObserver.disconnect();
        this.applicationObserver.stop();
        this.messageProcessor.stop();
        this.cacheManager.clear();
        console.log("[BantAI] Observers stopped");
    }
}

if (window.bantAIBuddySupervisor) {
    window.bantAIBuddySupervisor.destroy();
}

if (window.bantAIBuddyRuntimeMessageListener) {
    chrome.runtime.onMessage.removeListener(
        window.bantAIBuddyRuntimeMessageListener
    );
}

window.bantAIBuddyRuntimeMessageListener = request => {
    if (request?.action === 'showLockdownPopup') {
        PopupManager.showLockdownPopup();
    }
};
chrome.runtime.onMessage.addListener(window.bantAIBuddyRuntimeMessageListener);

window.bantAIBuddySupervisor = new BantAIBuddySupervisor();
window.bantAIBuddySupervisor.init();
