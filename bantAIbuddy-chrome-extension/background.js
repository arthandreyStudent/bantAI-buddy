// File: bantAIbuddy-chrome-extension/background.js

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        severeMessageCount: 0,
        messagesDetected: 0,
        messagesBlocked: 0,
        blockedMessages: {}
    });
});

// const DEFAULT_BACKEND_URL = 'https://bantaivercel.vercel.app/api/analyze';

// Default to the local Node.js middleware architecture for Phase 1 local development.
// This can be overridden in the extension settings via chrome.storage.local.
const DEFAULT_BACKEND_URL = 'http://localhost:3000/api/analyze';

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

async function getExplanationUrl() {
    const analysisUrl = await getBackendUrl();

    return analysisUrl.replace(/\/api\/analyze$/, '/api/explain');
}

/**
 * Communicates with the decoupled Express middleware bridge
 */
async function callBantAIBackend(text, context) {
    const backendUrl = await getBackendUrl();
    console.log(`[BantAI Buddy Worker] Calling endpoint: ${backendUrl}`);
    
    const { storedEmail } = await chrome.storage.local.get(['storedEmail']);
    
    const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageText: text,
            parentEmail: storedEmail || null,
            context: context || 'main'
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local backend processing error [${response.status}]: ${errorText}`);
    }
    
    return await response.json();
}

async function callBantAIExplanation(text, verdict) {
    const explanationUrl = await getExplanationUrl();
    console.log(`[BantAI Buddy Worker] Calling explanation endpoint: ${explanationUrl}`);

    const response = await fetch(explanationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageText: text,
            verdict
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local explanation error [${response.status}]: ${errorText}`);
    }

    return response.json();
}

const highSeverityMsgThreshold = 20;

async function analyzeMessage(text, messageId, context = 'main', tabId) {
    try {
        // Increment general tracking metric metrics
        const metrics = await chrome.storage.local.get(['messagesDetected', 'messagesBlocked']);
        await chrome.storage.local.set({ messagesDetected: (metrics.messagesDetected || 0) + 1 });

        const result = await callBantAIBackend(text, context);
        const shouldBlock = Boolean(result?.shouldBlock);
        
        const analysis = result?.analysis && typeof result.analysis === 'object'
            ? result.analysis
            : {
                action: 'ALLOW',
                severity: 1,
                category: 'UNKNOWN',
                language: 'English',
                confidence: 0
            };
        
        if (shouldBlock && context === 'main') {
            await storeBlockedMessage(messageId, text, analysis);
            await chrome.storage.local.set({ messagesBlocked: (metrics.messagesBlocked || 0) + 1 });

            if (analysis.severity >= 3) {
                const { severeMessageCount } = await chrome.storage.local.get(['severeMessageCount']);
                const newCount = (severeMessageCount || 0) + 1;

                console.log(`[BantAI Buddy] Local high severity instance registered. Threat level incremented to: ${newCount}`);
                await chrome.storage.local.set({ severeMessageCount: newCount });

                if (newCount >= highSeverityMsgThreshold && tabId) {
                    console.warn(`Critical threat frequency limit hit (${highSeverityMsgThreshold}). Triggering local safe lockdown.`);
                    await triggerLockdown(tabId);
                }
            }
        } 
        
        return {
            shouldBlock,
            messageId,
            severity: analysis.severity,
            details: analysis
        };
        
    } catch (error) {
        console.error('[BantAI Buddy Worker] Middleware communication breakdown:', error);
        return {
            messageId: messageId,
            error: error.message,
            shouldBlock: false // Fallback transparent block avoidance on complete engine failures
        };
    }
}

async function triggerLockdown(tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'showLockdownPopup' });
    await chrome.storage.local.set({ severeMessageCount: 0 });

    setTimeout(() => {
        console.log(`[BantAI Buddy Worker] Closing tab context frame: ${tabId}`);
        chrome.tabs.remove(tabId);
    }, 5000);
}

async function storeBlockedMessage(messageId, text, analysis) {
    if (!analysis) return;
    
    const data = await chrome.storage.local.get(['blockedMessages']);
    const blocked = data.blockedMessages || {};
    
    blocked[messageId] = {
        originalText: text,
        timestamp: Date.now(),
        category: analysis.category,
        severity: analysis.severity,
        language: analysis.language,
        confidence: analysis.confidence
    };
    
    const sorted = Object.entries(blocked)
        .sort(([,a], [,b]) => b.timestamp - a.timestamp)
        .slice(0, 100);
    
    await chrome.storage.local.set({ blockedMessages: Object.fromEntries(sorted) });
}

// Global runtime message listener for content script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeMessage') {
        const tabId = sender.tab ? sender.tab.id : null;
        
        (async () => {
            try {
                const result = await analyzeMessage(request.text, request.messageId, request.context || 'main', tabId);
                sendResponse(result);
            } catch (error) {
                console.error("Error in execution path handling analyzeMessage:", error);
                sendResponse({ shouldBlock: false, error: error.message });
            }
        })();
        return true; // Keep message channel accessible for async responses
    }

    if (request.action === 'explainMessage') {
        (async () => {
            try {
                const result = await callBantAIExplanation(request.text, request.verdict);
                sendResponse(result);
            } catch (error) {
                console.error("Error in execution path handling explainMessage:", error);
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }
    
    if (request.action === 'reloadTabAfterDelay') {
        setTimeout(() => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    const url = tabs[0].url;
                    if (url && (url.includes('messenger.com') || url.includes('facebook.com'))) {
                        chrome.tabs.reload(tabs[0].id);
                    }
                }
            });
        }, 4000);
        return true;
    }
});
