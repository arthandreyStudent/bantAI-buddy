// MessengerGuard Content Script - Optimized Version

class MessengerGuardWithBlur {
    constructor() {
        this.processedMessages = new Set();
        this.observer = null;
        this.init();
    }
    
    async init() {
        // Load saved data
        const result = await chrome.storage.local.get(['processedMessageIds']);
        if (result.processedMessageIds) this.processedMessages = new Set(result.processedMessageIds);
        
        // Inject styles directly
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                .messenger-guard-blurred { 
                    filter: blur(10px) !important; 
                    user-select: none !important; 
                    pointer-events: none !important; 
                }
                @keyframes slideInUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        `);
        
        if (document.body) this.startMonitoring();
        else document.addEventListener('DOMContentLoaded', () => this.startMonitoring());
        
        this.setupBackgroundListeners();
    }

    setupBackgroundListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'showLockdownPopup') {
                this.showLockdownPopup();
            }
        });
    }

    showLockdownPopup() {
        // Remove any existing popups first
        document.getElementById('messenger-guard-lockdown-popup')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'messenger-guard-lockdown-popup';

        // Style the overlay to cover the whole screen
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: '100000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#333',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: 'center'
        });

        // Create the message box
        overlay.innerHTML = `
            <div style="background: white; 
                        padding: 40px; 
                        border-radius: 15px; 
                        box-shadow: 0 5px 25px rgba(0,0,0,0.2); 
                        max-width: 450px;">
                <img style="width: 100px; 
                            height: 100px; 
                            margin-bottom: 20px;" src="${chrome.runtime.getURL('assets/uhoh.png')}" alt="BantAI Buddy">
                <h2 style="margin: 0 0 15px 0; 
                            color: #d9534f; 
                            font-size: 24px;">Safety Alert!</h2>
                <p style="margin: 0 0 20px 0; 
                    font-size: 16px; 
                    line-height: 1.6;">
                    You have been engaging with too many harmful messages. For your safety, this tab will now be closed.
                </p>
                <p style="font-size: 14px; 
                            color: #666;">
                    Please take a short break.
                </p>
            </div>
        `;

        document.body.appendChild(overlay);
    }
    
    startMonitoring() {
        if (!document.body) {
            setTimeout(() => this.startMonitoring(), 1000);
            return;
        }
        
        // Initial scan
        this.scanForNewMessages(document.body);
        
        // Monitor changes
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.scanForNewMessages(node);
                        }
                    });
                }
            });
        });
        
        this.observer.observe(document.body, { childList: true, subtree: true });
    }
    
    scanForNewMessages(container) {
        // Updated the message selectors that work for the current Messenger DOM structure. Adjust as necessary if the structure changes.
        const messageSelectors = ['[dir="auto"] div[class*="html-div xexx8yu xyri2b x18d9i69 x1c1uobl x1gslohp x14z9mp x12nagc x1lziwak x1yc453h x126k92a xyk4ms5"]'];
        
        messageSelectors.forEach(selector => {
            container.querySelectorAll(selector).forEach(element => {
                const text = element.textContent.trim();
                if (text && text.length > 0) {
                    const messageId = `msg_${text.substring(0, 20).replace(/\s/g, '_')}_${Date.now()}`;
                    this.analyzeMessage(text, messageId, element);
                }
            });
        });
    }
    
    async analyzeMessage(text, messageId, element) {
        if (!text || text.length < 2 || this.processedMessages.has(messageId)) return;
        
        try {
            this.processedMessages.add(messageId);
            
            const result = await chrome.runtime.sendMessage({
                action: 'analyzeMessage',
                text: text,
                messageId: messageId,
                context: 'main'
            });
            
            if (result && result.shouldBlock) {
                element.classList.add('messenger-guard-blurred');
                const aiComment = result.details?.reason || result.reason || 'Thank you for choosing to stay away from harmful content. You deserve a pat on the back!';
                showMessengerGuardPopup(result.severity, aiComment);
            }
            
            // Save immediately (no batch)
            chrome.storage.local.set({ 
                processedMessageIds: Array.from(this.processedMessages).slice(-500) 
            });
            
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }
    
    destroy() {
        if (this.observer) this.observer.disconnect();
    }
}

// Initialize when document is ready
function initializeMessengerGuard() {
    if (window.messengerGuard) window.messengerGuard.destroy();
    window.messengerGuard = new MessengerGuardWithBlur();
}

// Popup function
function showMessengerGuardPopup(_severity, aiComment) {
    document.getElementById('messenger-guard-popup')?.remove();

    const popup = document.createElement('div');
    popup.id = 'messenger-guard-popup';

    popup.innerHTML = `
        <div style="display: flex; 
                    align-items: center;
                    flex-direction: row-reverse;
                    gap: 15px;">
            <div style="background: rgba(255, 255, 255, 0.95); 
                        border-radius: 20px; 
                        padding: 15px 20px; 
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1); 
                        max-width: 300px;">
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                            font-size: 14px; color: #333; 
                            line-height: 1.5;">
                    <div style="font-weight: 600; 
                                color: #28a745; 
                                margin-bottom: 5px; 
                                font-size: 16px;">UH OH!</div>
                    <div>${aiComment}</div>
                </div>
            </div>
            <img style="width: 120px; 
                        height: 120px; 
                        object-fit: contain;" src="${chrome.runtime.getURL('assets/uhoh.png')}" alt="AI Bot">
        </div>
    `;

    Object.assign(popup.style, {
        position: 'fixed',
        bottom: '30px',
        left: '30px',
        zIndex: '99999',
        animation: 'slideInUp 0.4s ease-out',
    });

    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 10000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMessengerGuard);
} else {
    initializeMessengerGuard();
}

