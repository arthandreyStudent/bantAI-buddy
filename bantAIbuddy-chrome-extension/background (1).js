// File: background (1).js

async function callBantAIBackend(text) {
    const BACKEND_URL = 'https://bantai-backend.vercel.app/api/analyze';
    const { storedEmail } = await chrome.storage.local.get(['storedEmail']);
    
    const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageText: text,
            parentEmail: storedEmail || null
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        if(errorText.includes('content filter') || response.status === 400){
            return {
                reason: ['CONTENT_FILTER'],
                messageId,
                confidence: 1.0,
                action: 'BLOCK'
            };
        }
        throw new Error(`Backend API error ${response.status}: ${errorText}`);
    }
    
    return await response.json();
}

//for email alert
async function notifyUserIfSevere(text, analysis) {
    if (analysis.severity < 3) {
        console.log('Message severity below threshold for email notification.');
        return;
    }

    // Get the recipient email address from storage
    const { storedEmail } = await chrome.storage.sync.get('notifyEmailAddress');

    // If no email address is configured, cannot send email.
    if (!storedEmail) {
        console.log('Email notification address not set in extension options.');
        return;
    }

    const emailBackendUrl = 'https://bantai-buddy-alert-service-f4gde7ajgxa4hbet.southeastasia-01.azurewebsites.net/send-notification';

    try {
        console.log(`Sending email notification request for message ID: ${analysis.messageId} to ${storedEmail}`);
        const response = await fetch(emailBackendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: storedEmail, // This will be the recipient's email address
                threatLevel: analysis.severity,
                reason: analysis.reason,
                originalText: text
            })
        });

        if (response.ok) {
            console.log('Email notification request sent successfully to backend.');
        } else {
            const errorText = await response.text();
            console.error('Failed to send email notification request to backend:', response.status, errorText);
        }
    } catch (error) {
        console.error('Error making fetch request to email notification backend:', error);
    }
}

async function analyzeMessage(text, messageId) {
    try {
        const result = await callBantAIBackend(text);
        console.log(result);
        const { shouldBlock, analysis } = result;
        
        if (shouldBlock) {
            await updateCounters(true);
            await storeBlockedMessage(messageId, text, analysis);
        } else {
            await updateCounters(false);
        }
        
        return {
            reason: [analysis.reason],
            messageId,
            severity: mapSeverity(analysis.child_risk),
            details: analysis,
            shouldBlock: shouldBlock
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

function mapSeverity(childRisk) {
    const map = { 5: 'CRITICAL', 4: 'HIGH', 3: 'MEDIUM', 2: 'LOW', 1: 'NONE' };
    return map[childRisk] || 'MEDIUM';
}

async function updateCounters(blocked) {
    const data = await chrome.storage.local.get(['messagesDetected', 'messagesBlocked']);
    const newDetected = (data.messagesDetected || 0) + 1;
    const newBlocked = (data.messagesBlocked || 0) + (blocked ? 1 : 0);
    
    await chrome.storage.local.set({
        messagesDetected: newDetected,
        messagesBlocked: newBlocked
    });
    
    if (newBlocked > 0) {
        chrome.action.setBadgeText({ text: newBlocked.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    }
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
                const result = await analyzeMessage(request.text, request.messageId);
                sendResponse(result);
            } catch (error) {
                console.error("Error in onMessage listener:", error);
                sendResponse({ shouldBlock: false, error: error.message });
            }
        })();
        return true;
    }
});