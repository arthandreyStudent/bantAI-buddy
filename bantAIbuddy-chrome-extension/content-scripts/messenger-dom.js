// File: bantAIbuddy-chrome-extension/content-scripts/messenger-dom.js

/**
 * ============================================================================
 * Messenger DOM Adapter
 * ============================================================================
 *
 * Sole responsibility:
 * Translate Facebook Messenger's DOM into normalized Message objects.
 *
 * This module NEVER performs:
 * - AI inference
 * - DOM styling
 * - Popups
 * - Storage
 * - Business logic
 *
 * Every other module should communicate through the public API below instead
 * of touching Messenger's DOM directly.
 * ============================================================================
 */

class MessengerDOM {

    /* ------------------------------------------------------------------------
     * Stable Messenger Selectors
     * --------------------------------------------------------------------- */

    static MESSAGE_SELECTOR = '[aria-roledescription="message"]';
    static MESSAGE_TEXT_SELECTOR = 'div[dir="auto"]';
    static MESSAGE_ID_SELECTOR = '[data-message-id]';
    static fallbackMessageIds = new WeakMap();
    static fallbackMessageIdSequence = 0;

    /*
    * Messenger's scrolling message list.
    */
    static MESSAGE_LIST_SELECTOR = '[data-scope="messages_table"]';

    /* ------------------------------------------------------------------------
     * Public API
     * --------------------------------------------------------------------- */

    /**
     * Returns every valid Messenger message currently visible.
     *
     * @param {HTMLElement|Document} container
     * @returns {Array<Message>}
     */
    static getAllMessages(container = document) {
        return this.getMessageElements(container)
            .map(messageElement => this.extractMessageData(messageElement))
            .filter(message => this.isValidMessage(message));
    }

    /**
     * Reports how many message roots are rendered and how many could be
     * normalized. This is diagnostic data only; it helps distinguish a wrong
     * conversation root from a changed Messenger message shape.
     */
    static getMessageDiagnostics(container = document) {
        const elements = this.getMessageElements(container);
        const messages = elements.map(element => this.extractMessageData(element));
        const conversationLists = Array.from(
            document.querySelectorAll(this.MESSAGE_LIST_SELECTOR)
        );

        return {
            rendered: elements.length,
            valid: messages.filter(message => this.isValidMessage(message)).length,
            missingId: messages.filter(message => !message.id).length,
            missingText: messages.filter(message => !message.text).length,
            globalMessageRoots: this.getMessageElements(document).length,
            messageListCount: conversationLists.length,
            messageRootsPerList: conversationLists.map(list =>
                this.getMessageElements(list).length
            ),
            roleDescriptionsInConversation: this.getAttributeValues(
                container,
                "aria-roledescription"
            )
        };
    }

    /**
     * Returns the Message object that owns the supplied DOM node.
     *
     * Used heavily by the MutationObserver.
     *
     * @param {Node} node
     * @returns {Message|null}
     */
    static getMessageFromNode(node) {
        if (!node) return null;

        const messageElement = this.findNearestMessage(node);

        if (!messageElement) {
            return null;
        }

        const message = this.extractMessageData(messageElement);

        return this.isValidMessage(message)
            ? message
            : null;
    }

    /**
     * Finds a message by Messenger's native message ID.
     *
     * @param {string} messageId
     * @param {HTMLElement|Document} container
     * @returns {Message|null}
     */
    static getMessageById(messageId, container = document) {
        for (const messageElement of this.getMessageElements(container)) {
            const message = this.extractMessageData(messageElement);

            if (message.id === messageId && this.isValidMessage(message)) {
                return message;
            }
        }

        return null;
    }

    /**
     * Refreshes a previously extracted Message object.
     *
     * Useful if Messenger edits a message.
     *
     * @param {Message} message
     * @returns {Message|null}
     */
    static refreshMessage(message) {
        if (!message?.root) {
            return null;
        }

        return this.extractMessageData(message.root);
    }

    /**
     * Determines whether a Message contains usable data.
     *
     * @param {Message} message
     * @returns {boolean}
     */
    static isValidMessage(message) {
        return Boolean(
            message &&
            message.id &&
            message.text &&
            message.text.trim().length > 0 &&
            message.textNode
        );
    }

    /* ------------------------------------------------------------------------
     * Internal DOM Helpers
     * --------------------------------------------------------------------- */

    /**
     * Returns raw Messenger message elements.
     *
     * @private
     */
    static getMessageElements(container = document) {
        return Array.from(
            container.querySelectorAll(this.MESSAGE_SELECTOR)
        );
    }

    /**
     * Returns the nearest Messenger message ancestor.
     *
     * @private
     */
    static findNearestMessage(node) {
        if (!(node instanceof Element)) {
            node = node.parentElement;
        }

        return node?.closest(this.MESSAGE_SELECTOR) ?? null;
    }

    /**
     * Extract Messenger's native message ID.
     *
     * @private
     */
    static extractMessageId(messageElement) {
        const nativeId = (
            messageElement.dataset.messageId ??
            messageElement.closest(this.MESSAGE_ID_SELECTOR)
                ?.dataset.messageId ??
            messageElement.querySelector(this.MESSAGE_ID_SELECTOR)
                ?.dataset.messageId ??
            null
        );

        if (nativeId) {
            return this.normalizeMessageId(nativeId);
        }

        // Some Messenger variants omit a usable data-message-id from the
        // accessible message root. Preserve a stable ID while that root keeps
        // representing the same rendered content, but assign a new one when
        // React recycles the node for another message.
        const signature = [
            messageElement.getAttribute("aria-label") ?? "",
            messageElement.innerText ?? ""
        ].join("\\n");
        const existing = this.fallbackMessageIds.get(messageElement);

        if (existing?.signature === signature) {
            return existing.id;
        }

        const id = `bantai-dom-${++this.fallbackMessageIdSequence}`;
        this.fallbackMessageIds.set(messageElement, { id, signature });
        return id;
    }

    /**
     * Messenger can render the same logical message with either its bare
     * message ID or a qualified `sender@msgr.messageId` form. The final
     * numeric component is the shared message identity, so normalize both
     * shapes before the supervisor deduplicates them.
     *
     * @private
     */
    static normalizeMessageId(messageId) {
        const match = String(messageId).match(/(?:^|\.)(\d+)$/);

        return match?.[1] ?? messageId;
    }

    /**
     * Extract the visible chat text.
     *
     * @private
     */
    static extractMessageText(messageElement) {
        const textNodes = Array.from(
            messageElement.querySelectorAll(this.MESSAGE_TEXT_SELECTOR)
        );
        const textNode = textNodes.find(node => node.innerText.trim()) ?? null;

        return {
            textNode,
            text: textNode?.innerText.trim() ?? ""
        };
    }

    /**
     * Determines whether the message was sent by the current user.
     *
     * @private
     */
    static isOutgoing(messageElement) {
        const label =
            messageElement.getAttribute("aria-label") ?? "";

        return (
            label.includes("You:") ||
            label.includes("by You:")
        );
    }

    /**
     * Attempts to extract the sender name.
     *
     * @private
     */
    static extractSender(messageElement) {
        const label =
            messageElement.getAttribute("aria-label") ?? "";

        const match =
            label.match(/by (.*?):/);

        return match?.[1] ?? null;
    }

    /**
     * Attempts to extract the timestamp.
     *
     * @private
     */
    static extractTimestamp(messageElement) {
        const label =
            messageElement.getAttribute("aria-label") ?? "";

        const match =
            label.match(/^At (.*?),/);

        return match?.[1] ?? null;
    }

    /**
     * Returns the visual bubble container.
     *
     * NOTE:
     * Currently returns the message root.
     * This will become much smarter in Phase 4.
     *
     * @private
     */
    static findBubbleElement(messageElement) {
        return messageElement;
    }

    /**
     * Creates a normalized immutable Message object.
     *
     * @private
     */
    static extractMessageData(messageElement) {
        const id =
            this.extractMessageId(messageElement);

        const {
            text,
            textNode
        } = this.extractMessageText(messageElement);

        return Object.freeze({
            id,
            text,
            root: messageElement,
            textNode,
            bubble: this.findBubbleElement(messageElement),
            timestamp: this.extractTimestamp(messageElement),
            sender: this.extractSender(messageElement),
            isOutgoing: this.isOutgoing(messageElement)

        });
    }

    /**
     * Returns the active Messenger conversation region.
     *
     * Messenger currently renders accessible message roots outside of its
     * `messages_table` nodes. We therefore prefer the semantic main region
     * containing visible message roots, and retain messages_table only as a
     * fallback while Messenger is still mounting.
    */
    static getConversationContainer(preferredContainer = null) {
        const visibleMessages = this.getMessageElements(document)
            .filter(message => this.isVisible(message));
        const messageRoots = visibleMessages.length
            ? visibleMessages
            : this.getMessageElements(document);
        const mainRegions = messageRoots
            .map(message => message.closest('[role="main"]'))
            .filter(Boolean);

        if (mainRegions.length) {
            return this.getMostFrequentElement(mainRegions);
        }

        if (preferredContainer?.isConnected) {
            return preferredContainer;
        }

        const candidates = Array.from(
            document.querySelectorAll(this.MESSAGE_LIST_SELECTOR)
        );

        return candidates.sort((first, second) => {
            return this.getMessageElements(second).length -
                this.getMessageElements(first).length;
        })[0] ?? null;
    }

    /** @private */
    static isVisible(element) {
        return !element.closest('[aria-hidden="true"]') &&
            element.getClientRects().length > 0;
    }

    /** @private */
    static getMostFrequentElement(elements) {
        const occurrences = new Map();

        elements.forEach(element => {
            occurrences.set(element, (occurrences.get(element) ?? 0) + 1);
        });

        return Array.from(occurrences.entries())
            .sort(([, firstCount], [, secondCount]) =>
                secondCount - firstCount
            )[0]?.[0] ?? null;
    }

    /**
     * Returns attribute values and occurrence counts without exposing message
     * content. Used only to diagnose Messenger markup changes.
     *
     * @private
     */
    static getAttributeValues(container, attributeName) {
        const values = new Map();

        container.querySelectorAll(`[${attributeName}]`).forEach(element => {
            const value = element.getAttribute(attributeName);
            values.set(value, (values.get(value) ?? 0) + 1);
        });

        return Object.fromEntries(values);
    }

    /**
     * Returns message roots represented by a newly added DOM node.
     *
     * Keeping this traversal here prevents observers from depending on
     * Messenger-specific selectors.
     *
     * @param {Node} node
     * @returns {Array<HTMLElement>}
     */
    static getMessageElementsFromNode(node) {
        if (!(node instanceof Element)) {
            return [];
        }

        const roots = new Set();
        const nearestMessage = this.findNearestMessage(node);

        if (nearestMessage) {
            roots.add(nearestMessage);
        }

        this.getMessageElements(node).forEach(root => roots.add(root));

        return Array.from(roots);
    }

}

/**
 * ============================================================================
 * Message Object
 * ============================================================================
 *
 * @typedef {Object} Message
 *
 * @property {string} id
 * @property {string} text
 * @property {HTMLElement} root
 * @property {HTMLElement} textNode
 * @property {HTMLElement} bubble
 * @property {string|null} timestamp
 * @property {string|null} sender
 * @property {boolean} isOutgoing
 * ============================================================================
 */
