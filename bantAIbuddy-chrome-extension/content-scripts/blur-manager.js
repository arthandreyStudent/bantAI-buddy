/**
 * Applies and removes the extension's visual message masking treatment.
 * This module only changes presentation; it never performs moderation or DOM
 * extraction.
 */
class BlurManager {

    static BLURRED_CLASS = 'messenger-guard-blurred';
    static BLURRED_ATTRIBUTE = 'data-bantai-blurred';
    static REAPPLY_DELAY_MS = 350;
    static blockedMessageIds = new Set();

    /**
     * @param {Message} message
     * @returns {boolean} Whether a message element was masked.
     */
    static blur(message) {
        if (!message?.id) {
            return false;
        }

        this.blockedMessageIds.add(message.id);
        const blurred = this.apply(message);
        this.scheduleReapply(message.id);

        return blurred;
    }

    /**
     * Reapplies masking when Messenger virtualizes or replaces a previously
     * blocked message node.
     *
     * @param {Message} message
     * @returns {boolean}
     */
    static reapplyIfBlocked(message) {
        if (!message?.id || !this.blockedMessageIds.has(message.id)) {
            return false;
        }

        return this.apply(message);
    }

    /**
     * @param {Message} message
     * @returns {boolean}
     */
    static unblur(message) {
        if (!message?.id) {
            return false;
        }

        this.blockedMessageIds.delete(message.id);
        const target = this.getTarget(message);

        if (!target) {
            return false;
        }

        target.classList.remove(this.BLURRED_CLASS);
        target.removeAttribute(this.BLURRED_ATTRIBUTE);

        return true;
    }

    /**
     * @param {Message} message
     * @returns {boolean}
     */
    static isBlurred(message) {
        return this.getTarget(message)?.classList.contains(this.BLURRED_CLASS) ?? false;
    }

    /** @private */
    static apply(message) {
        const target = this.getTarget(message);

        if (!target) {
            return false;
        }

        target.classList.add(this.BLURRED_CLASS);
        target.setAttribute(this.BLURRED_ATTRIBUTE, 'true');

        return true;
    }

    /** @private */
    static scheduleReapply(messageId) {
        requestAnimationFrame(() => this.reapplyById(messageId));
        window.setTimeout(
            () => this.reapplyById(messageId),
            this.REAPPLY_DELAY_MS
        );
    }

    /** @private */
    static reapplyById(messageId) {
        if (!this.blockedMessageIds.has(messageId)) {
            return;
        }

        const currentMessage = MessengerDOM.getMessageById(messageId);

        if (currentMessage) {
            this.apply(currentMessage);
        }
    }

    /** @private */
    static getTarget(message) {
        const currentMessage = message?.id
            ? MessengerDOM.getMessageById(message.id)
            : null;
        const target = currentMessage?.bubble ?? currentMessage?.root ??
            message?.bubble ?? message?.root;

        return target instanceof HTMLElement ? target : null;
    }
}
