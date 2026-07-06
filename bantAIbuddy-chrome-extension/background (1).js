chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        severeMessageCount: 0,
        messagesDetected: 0,
        messagesBlocked: 0,
        blockedMessages: {}
    });
});

const DEFAULT_BACKEND_URL = 'https://bantai-backend.vercel.app/api/analyze';

function normalizeBackendUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return DEFAULT_BACKEND_URL;
    }

    const trimmed = rawUrl.trim();

    if (trimmed.endsWith('/api/analyze')) {
        return trimmed;
    }

    if (trimmed.endsWith('/')) {
        return `${trimmed}api/analyze`;
    }

    return `${trimmed}/api/analyze`;
}

async function getBackendUrl() {
    const data = await chrome.storage.local.get(['backendAnalyzeUrl', 'backendBaseUrl']);
    return normalizeBackendUrl(data.backendAnalyzeUrl || data.backendBaseUrl || DEFAULT_BACKEND_URL);
}

// This is the ONLY function needed to communicate with your backend.
async function callBantAIBackend(text, context) {
    const backendUrl = await getBackendUrl();
    console.log(`[BantAI] Calling backend: ${backendUrl}`);
    
    // Get the parent's email from storage to send to the backend.
    const { storedEmail } = await chrome.storage.local.get(['storedEmail']);
    
    const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageText: text,
            parentEmail: storedEmail || null, // The backend now receives the email
            context: context || 'main'
        })
    });

    console.log(`[BantAI] Backend response status: ${response.status}`);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend API error ${response.status}: ${errorText}`);
    }
    
    return await response.json();
}

const highSeverityMsgThreshold = 10;

async function analyzeMessage(text, messageId, context = 'main', tabId) {
    try {
        // This single backend call handles both analysis AND email notifications.
        const result = await callBantAIBackend(text, context);
        const shouldBlock = Boolean(result?.shouldBlock);
        const analysis = result?.analysis && typeof result.analysis === 'object'
            ? result.analysis
            : {
                reason: 'No analysis payload returned by backend.',
                severity: 1,
                category: 'UNKNOWN'
            };
        
        if (shouldBlock && context === 'main') {
            await storeBlockedMessage(messageId, text, analysis);
                // The call to notifyUserIfSevere is removed because the backend handles it.
            if (analysis.severity >= 3) {
                const { severeMessageCount } = await chrome.storage.local.get(['severeMessageCount']);
                const newCount = (severeMessageCount || 0) + 1;

                console.log(`High severity message detected. New count: ${newCount}`);
                await chrome.storage.local.set({ severeMessageCount: newCount });

                if (newCount >= highSeverityMsgThreshold) {
                    console.log('Severe message threshold reached. Triggering lockdown.');
                    await triggerLockdown(tabId);
                }
            }
        } 
        
        return {
            shouldBlock,
            reason: [analysis.reason],
            messageId,
            severity: mapSeverity(analysis.severity),
            details: analysis
        };
        
    } catch (error) {
        console.error('Backend analysis error:', error);
        return {
            reasons: [],
            messageId: messageId,
            error: error.message,
            shouldBlock: false
        };
    }
}

async function triggerLockdown(tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'showLockdownPopup' });

    await chrome.storage.local.set({ severeMessageCount: 0 });

    setTimeout(() => {
        console.log(`Closing tab ${tabId} due to lockdown.`);
        chrome.tabs.remove(tabId);
    }, 5000);
}

// Map severity based on the number from the analysis, not a string.
function mapSeverity(severityNumber) {
    const map = { 5: 'CRITICAL', 4: 'HIGH', 3: 'MEDIUM', 2: 'LOW', 1: 'NONE' };
    return map[severityNumber] || 'MEDIUM';
}

async function storeBlockedMessage(messageId, text, analysis) {
    if (!analysis) {
        console.error("storeBlockedMessage called with invalid analysis object for messageId:", messageId);
        return;
    }
    const data = await chrome.storage.local.get(['blockedMessages']);
    const blocked = data.blockedMessages || {};
    
    blocked[messageId] = {
        originalText: text,
        timestamp: Date.now(),
        category: analysis.category,
        severity: analysis.severity,
        reason: analysis.reason
    };
    
    const sorted = Object.entries(blocked)
        .sort(([,a], [,b]) => b.timestamp - a.timestamp)
        .slice(0, 100);
    
    await chrome.storage.local.set({ blockedMessages: Object.fromEntries(sorted) });
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'analyzeMessage') {
        (async () => {
            try {
                const result = await analyzeMessage(request.text, request.messageId, request.context || 'main', _sender.tab.id);
                sendResponse(result);
            } catch (error) {
                console.error("Error in onMessage listener:", error);
                sendResponse({ shouldBlock: false, error: error.message });
            }
        })();
        return true;
    }
    else if (request.action === 'reloadTabAfterDelay') {
        console.log("Background script received reload request.");

        // Automatically reload the active tab after submitting the email
        setTimeout(() => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    const url = tabs[0].url;
                    if (url && (url.includes('messenger.com') || url.includes('facebook.com'))) {
                        console.log(`Reloading tab: ${tabs[0].id} with URL: ${url}`);
                        chrome.tabs.reload(tabs[0].id);
                    } else {
                        console.log('Active tab is not Messenger or Facebook, not reloading.');  
                    }
                }
            });
        }, 4000);
    }
});