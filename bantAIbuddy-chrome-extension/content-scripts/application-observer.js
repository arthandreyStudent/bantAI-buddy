/**
 * Watches the Messenger application shell for active-conversation replacement.
 *
 * It deliberately does not extract or process messages. Its only output is
 * the currently mounted conversation container, which lets the supervisor
 * reconnect the conversation observer after SPA navigation.
 */
class ApplicationObserver {

    constructor() {
        this.observer = null;
        this.frameRequested = false;
        this.listeners = new Set();
        this.currentContainer = null;
    }

    start() {
        if (this.observer) {
            return;
        }
        this.observer = new MutationObserver(
            this.handleMutations.bind(this)
        );

        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        this.evaluateConversation();
        console.log("[BantAI] Application observer started");
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
        this.frameRequested = false;
        this.currentContainer = null;
    }

    onConversationChanged(callback) {
        this.listeners.add(callback);

        return () => this.listeners.delete(callback);
    }

    offConversationChanged(callback) {
        this.listeners.delete(callback);
    }

    emit(container) {
        for (const listener of this.listeners) {
            listener(container);
        }
    }

    handleMutations() {
        this.scheduleFlush();
    }

    scheduleFlush() {
        if (this.frameRequested) {
            return;
        }

        this.frameRequested = true;

        requestAnimationFrame(() => {
            this.frameRequested = false;
            this.evaluateConversation();
        });
    }

    evaluateConversation() {
        const nextContainer = MessengerDOM.getConversationContainer(
            this.currentContainer
        );

        if (nextContainer === this.currentContainer) {
            return;
        }

        this.currentContainer = nextContainer;
        console.log(
            `[BantAI] Active conversation ${nextContainer ? "mounted" : 
            "unmounted"}`
        );
        this.emit(nextContainer);
    }

}
