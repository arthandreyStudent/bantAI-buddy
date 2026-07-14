/**
 * Watches one mounted Messenger conversation for message-level DOM changes.
 * A new instance (or attachment) is used whenever the application observer
 * reports a different message list.
 */
class ConversationObserver {

    constructor(onMessageDetected) {
        this.onMessageDetected = onMessageDetected;
        this.observer = null;
        this.container = null;
        this.pendingRoots = new Set();
        this.frameRequested = false;
    }

    observe(container) {
        if (!container) {
            this.disconnect();
            return;
        }

        if (container === this.container && this.observer) {
            return;
        }

        this.disconnect();
        this.container = container;
        this.observer = new MutationObserver(
            this.handleMutations.bind(this)
        );
        this.observer.observe(container, {
            childList: true,
            characterData: true,
            subtree: true
        });

        console.log("[BantAI] Conversation observer started");
    }

    disconnect() {
        this.observer?.disconnect();
        this.observer = null;
        this.container = null;
        this.pendingRoots.clear();
        this.frameRequested = false;
    }

    handleMutations(mutations) {
        for (const mutation of mutations) {
            if (mutation.type === "childList") {
                mutation.addedNodes.forEach(node =>
                this.collectMessage(node));
            }

            if (mutation.type === "characterData") {
                this.collectMessage(mutation.target);
            }
        }

        this.scheduleFlush();
    }

    collectMessage(node) {
        const message = MessengerDOM.getMessageFromNode(node);
        if (message) {
            this.pendingRoots.add(message.root);
        }

        MessengerDOM.getMessageElementsFromNode(node).forEach(root => {
            this.pendingRoots.add(root);
        });
    }

    scheduleFlush() {
        if (this.frameRequested || this.pendingRoots.size === 0) {
            return;
        }

        this.frameRequested = true;
        requestAnimationFrame(() => this.flush());
    }

    flush() {
        this.frameRequested = false;

        const roots = Array.from(this.pendingRoots);
        this.pendingRoots.clear();

        for (const root of roots) {
            const message = MessengerDOM.getMessageFromNode(root);
            if (message) {
                this.onMessageDetected(message);
            }
        }
    }
}
