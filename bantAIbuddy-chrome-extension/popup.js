document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(['setupComplete', 'apiKeyIsSet', 'storedEmail'], (data) => {
        const setupComplete = data.setupComplete === true || data.apiKeyIsSet === true || Boolean(data.storedEmail);

        if (setupComplete) {
            window.location.href = 'activate.html';
            chrome.action.setBadgeText({ text: '✓' });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            window.location.href = 'setup.html';
        }
    });
});