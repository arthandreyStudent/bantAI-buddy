/**
 * Renders the child educational popup and the severe-frequency lockdown UI.
 * Content is added as text rather than HTML because model output is untrusted.
 */
class PopupManager {

    static EDUCATIONAL_POPUP_ID = 'bantai-educational-popup';
    static LOCKDOWN_POPUP_ID = 'messenger-guard-lockdown-popup';
    static DISPLAY_DURATION_MS = 12_000;
    static FADE_OUT_DURATION_MS = 350;

    /**
     * @param {{childComment: string}} explanation
     * @returns {HTMLElement|null}
     */
    static show(explanation) {
        const childComment = typeof explanation?.childComment === 'string'
            ? explanation.childComment.trim()
            : '';

        if (!childComment) {
            return null;
        }

        document.getElementById(this.EDUCATIONAL_POPUP_ID)?.remove();

        const root = document.createElement('aside');
        root.id = this.EDUCATIONAL_POPUP_ID;
        root.className = 'bantai-popup-root';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');

        const container = document.createElement('div');
        container.className = 'bantai-popup-container';

        const card = document.createElement('div');
        card.className = 'bantai-popup-card';

        const title = document.createElement('div');
        title.className = 'bantai-popup-title';
        title.textContent = 'UH OH!';

        const body = document.createElement('div');
        body.className = 'bantai-popup-body';
        body.textContent = childComment;

        const avatar = document.createElement('img');
        avatar.className = 'bantai-popup-avatar';
        avatar.src = chrome.runtime.getURL('assets/uhoh.png');
        avatar.alt = 'BantAI Buddy';

        card.append(title, body);
        container.append(card, avatar);
        root.append(container);
        document.body.append(root);
        window.setTimeout(() => this.dismiss(root), this.DISPLAY_DURATION_MS);

        return root;
    }

    static dismiss(root = document.getElementById(this.EDUCATIONAL_POPUP_ID)) {
        if (!root?.isConnected) {
            return;
        }

        root.classList.add('bantai-popup-root--dismissing');
        window.setTimeout(() => root.remove(), this.FADE_OUT_DURATION_MS);
    }

    /**
     * Shows the non-dismissible safety notice immediately before the
     * background worker closes the Messenger tab.
     *
     * @returns {HTMLElement}
     */
    static showLockdownPopup() {
        document.getElementById(this.LOCKDOWN_POPUP_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = this.LOCKDOWN_POPUP_ID;
        overlay.className = 'bantai-lockdown-overlay';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'bantai-lockdown-title');

        const modal = document.createElement('div');
        modal.className = 'bantai-lockdown-modal';

        const icon = document.createElement('img');
        icon.className = 'bantai-lockdown-icon';
        icon.src = chrome.runtime.getURL('assets/uhoh.png');
        icon.alt = 'BantAI Buddy';

        const title = document.createElement('h2');
        title.id = 'bantai-lockdown-title';
        title.className = 'bantai-lockdown-title';
        title.textContent = 'Safety Alert!';

        const message = document.createElement('p');
        message.className = 'bantai-lockdown-text';
        message.textContent = 'You have been engaging with too many harmful messages. For your safety, this tab will now be closed.';

        const footer = document.createElement('p');
        footer.className = 'bantai-lockdown-footer';
        footer.textContent = 'Please take a short break.';

        modal.append(icon, title, message, footer);
        overlay.append(modal);
        document.body.append(overlay);

        return overlay;
    }
}
