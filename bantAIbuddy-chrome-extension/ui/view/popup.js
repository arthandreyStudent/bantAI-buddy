// File: bantAIbuddy-chrome-extension/ui/view/popup.js

document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(['setupComplete', 'storedEmail'], (data) => {
        // Enforce fallback checks to ensure setup complete matches an active linked email address
        const isConfigured = data.setupComplete === true && Boolean(data.storedEmail);

        if (isConfigured) {
            window.location.href = '/ui/onboarding/activate.html';
            chrome.action.setBadgeText({ text: '✓' });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            window.location.href = '/ui/onboarding/setup.html';
        }
    });
});