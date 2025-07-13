document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(['apiKeyIsSet'], (data) => {
        if (data.apiKeyIsSet === true) { // Explicitly check if it's true
            // API key is set, go directly to the final activated page
            window.location.href = 'activate.html';
            // Set the badge to indicate success
            chrome.action.setBadgeText({ text: '✓' });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            // API key is NOT set, start the setup flow from the very first page
            window.location.href = 'setup.html';
        }
    });
});