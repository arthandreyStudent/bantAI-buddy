/**
 * Stores lightweight processing state for Messenger messages.
 *
 * This module deliberately knows nothing about Messenger DOM, AI results, or
 * UI. It stores canonical IDs plus a one-way fingerprint alias for React DOM
 * remounts, but never retains raw message text. Completed verdicts persist in
 * chrome.storage.local so reloads can skip repeat inference and restore blur.
 */
class CacheManager {

    static DEFAULT_MAX_ENTRIES = 2_000;
    static STORAGE_KEY = 'bantaiMessageCacheV1';

    constructor({ maxEntries = CacheManager.DEFAULT_MAX_ENTRIES } = {}) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1) {
            throw new TypeError("maxEntries must be a positive integer.");
        }

        this.maxEntries = maxEntries;
        this.entries = new Map();
        this.aliases = new Map();
        this.ready = this.restore();
    }

    /**
     * Atomically claims a message for processing.
     *
     * @param {Message|string} message
     * @returns {boolean} True only for the first claim of this ID.
     */
    claim(message) {
        const identity = this.getIdentity(message);

        if (!identity || this.getEntryIds(identity.idKey).size) {
            return false;
        }

        const fingerprintEntryIds = this.getEntryIds(identity.fingerprintKey);
        const matchesFallbackEntry = Array.from(fingerprintEntryIds)
            .some(entryId => this.entries.get(entryId)?.isFallback);

        if ((identity.isFallback && fingerprintEntryIds.size) || matchesFallbackEntry) {
            return false;
        }

        const entryId = identity.idKey;
        this.entries.set(entryId, {
            processedAt: Date.now(),
            keys: [identity.idKey, identity.fingerprintKey],
            isFallback: identity.isFallback,
            analyzed: false,
            blocked: false
        });
        this.addAlias(identity.idKey, entryId);
        this.addAlias(identity.fingerprintKey, entryId);
        this.evictOverflow();

        return true;
    }

    /**
     * @param {Message|string} message
     * @returns {boolean}
     */
    has(message) {
        const identity = this.getIdentity(message);

        if (!identity) {
            return false;
        }

        if (this.getEntryIds(identity.idKey).size) {
            return true;
        }

        const fingerprintEntryIds = this.getEntryIds(identity.fingerprintKey);

        return identity.isFallback
            ? fingerprintEntryIds.size > 0
            : Array.from(fingerprintEntryIds)
                .some(entryId => this.entries.get(entryId)?.isFallback);
    }

    /**
     * Marks an accepted message as fully analyzed and persists only its
     * privacy-safe identity and block state.
     *
     * @param {Message|string} message
     * @param {boolean} blocked
     * @returns {Promise<void>}
     */
    async markAnalyzed(message, blocked) {
        const entryId = this.findEntryId(message);
        const entry = entryId ? this.entries.get(entryId) : null;

        if (!entry) {
            return;
        }

        entry.analyzed = true;
        entry.blocked = blocked === true;
        entry.processedAt = Date.now();
        await this.persist();
    }

    /**
     * @param {Message|string} message
     * @returns {boolean}
     */
    isBlocked(message) {
        const entryId = this.findEntryId(message);

        return entryId ? this.entries.get(entryId)?.blocked === true : false;
    }

    /**
     * Allows a future retry flow to release a failed message.
     *
     * @param {Message|string} message
     * @returns {boolean}
     */
    forget(message) {
        const identity = this.getIdentity(message);

        if (!identity) {
            return false;
        }

        const entryId = this.findEntryId(message);

        if (!entryId) {
            return false;
        }

        const removed = this.deleteEntry(entryId);
        void this.persist();

        return removed;
    }

    clear() {
        this.entries.clear();
        this.aliases.clear();
    }

    get size() {
        return this.entries.size;
    }

    /** @private */
    evictOverflow() {
        while (this.entries.size > this.maxEntries) {
            this.deleteEntry(this.entries.keys().next().value);
        }
    }

    /** @private */
    deleteEntry(entryId) {
        const entry = this.entries.get(entryId);

        if (!entry) {
            return false;
        }

        entry.keys.forEach(key => this.removeAlias(key, entryId));
        this.entries.delete(entryId);

        return true;
    }

    /** @private */
    findEntryId(message) {
        const identity = this.getIdentity(message);

        if (!identity) {
            return null;
        }

        const directEntryId = this.getEntryIds(identity.idKey)
            .values().next().value;

        if (directEntryId) {
            return directEntryId;
        }

        const fingerprintEntryIds = this.getEntryIds(identity.fingerprintKey);

        if (identity.isFallback) {
            return fingerprintEntryIds.values().next().value ?? null;
        }

        return Array.from(fingerprintEntryIds)
            .find(entryId => this.entries.get(entryId)?.isFallback) ?? null;
    }

    /** @private */
    getIdentity(message) {
        if (typeof message === 'string' && message) {
            return {
                idKey: `id:${message}`,
                fingerprintKey: null,
                isFallback: false
            };
        }

        if (!message?.id) {
            return null;
        }

        const fingerprint = this.getFingerprint(message);

        return {
            idKey: `id:${message.id}`,
            fingerprintKey: fingerprint ? `fingerprint:${fingerprint}` : null,
            isFallback: String(message.id).startsWith('bantai-dom-')
        };
    }

    /**
     * A 64-bit FNV-1a fingerprint lets a remounted message match its previous
     * cache entry without retaining the original text in memory.
     *
     * @private
     */
    getFingerprint(message) {
        const source = [
            message.text,
            message.timestamp ?? '',
            message.sender ?? '',
            message.isOutgoing ? 'outgoing' : 'incoming'
        ].join('\u001F');

        if (!source.trim()) {
            return null;
        }

        let hash = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        const mask = 0xffffffffffffffffn;

        for (let index = 0; index < source.length; index += 1) {
            hash ^= BigInt(source.charCodeAt(index));
            hash = (hash * prime) & mask;
        }

        return hash.toString(16);
    }

    /** @private */
    getEntryIds(key) {
        return key ? this.aliases.get(key) ?? new Set() : new Set();
    }

    /** @private */
    addAlias(key, entryId) {
        if (!key) {
            return;
        }

        const entryIds = this.aliases.get(key) ?? new Set();
        entryIds.add(entryId);
        this.aliases.set(key, entryIds);
    }

    /** @private */
    removeAlias(key, entryId) {
        if (!key) {
            return;
        }

        const entryIds = this.aliases.get(key);

        if (!entryIds) {
            return;
        }

        entryIds.delete(entryId);

        if (entryIds.size === 0) {
            this.aliases.delete(key);
        }
    }

    /** @private */
    async restore() {
        if (!globalThis.chrome?.storage?.local) {
            return;
        }

        try {
            const stored = await chrome.storage.local.get(this.constructor.STORAGE_KEY);
            const savedEntries = stored?.[this.constructor.STORAGE_KEY]?.entries;

            if (!Array.isArray(savedEntries)) {
                return;
            }

            for (const savedEntry of savedEntries) {
                if (
                    !savedEntry?.entryId ||
                    !Array.isArray(savedEntry.keys) ||
                    !savedEntry.keys.every(key => key === null || typeof key === 'string')
                ) {
                    continue;
                }

                this.entries.set(savedEntry.entryId, {
                    processedAt: Number(savedEntry.processedAt) || Date.now(),
                    keys: savedEntry.keys,
                    isFallback: savedEntry.isFallback === true,
                    analyzed: true,
                    blocked: savedEntry.blocked === true
                });
                savedEntry.keys.forEach(key => this.addAlias(key, savedEntry.entryId));
            }

            this.evictOverflow();
            console.log(`[BantAI] Restored ${this.entries.size} analyzed message cache entries.`);
        } catch (error) {
            console.warn('[BantAI] Could not restore persistent message cache:', error);
        }
    }

    /** @private */
    async persist() {
        if (!globalThis.chrome?.storage?.local) {
            return;
        }

        const entries = Array.from(this.entries.entries())
            .filter(([, entry]) => entry.analyzed)
            .map(([entryId, entry]) => ({
                entryId,
                processedAt: entry.processedAt,
                keys: entry.keys,
                isFallback: entry.isFallback,
                blocked: entry.blocked
            }));

        try {
            await chrome.storage.local.set({
                [this.constructor.STORAGE_KEY]: { entries }
            });
        } catch (error) {
            console.warn('[BantAI] Could not persist message cache:', error);
        }
    }
}
