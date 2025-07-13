// MessengerGuard Content Script - Trimmed and Optimized Version

class MessengerGuardWithBlur {
    constructor() {
        this.processedMessages = new Set();
        this.blurredChats = new Map();
        this.observer = null;
        this.styleSheet = null;
        this.pendingStorageUpdate = false;
        
        this.init();
    }
    
    async init() {
        // Load saved data
        const result = await chrome.storage.local.get(['processedMessageIds', 'blurredChats']);
        if (result.processedMessageIds) {
            this.processedMessages = new Set(result.processedMessageIds);
        }
        if (result.blurredChats) {
            this.blurredChats = new Map(result.blurredChats);
        }
        
        this.createBlurStyles();
        
        if (document.body) {
            this.startMonitoring();
        } else {
            document.addEventListener('DOMContentLoaded', () => this.startMonitoring());
        }
        
        // Batch storage updates every 30 seconds
        setInterval(() => this.batchSaveToStorage(), 30000);
        
        // Less frequent blur reapplication
        setInterval(() => this.reapplyBlurStates(), 2000);
    }
    
    createBlurStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .messenger-guard-blurred {
                filter: blur(10px) !important;
                user-select: none !important;
                pointer-events: none !important;
            }
            .messenger-guard-sidebar-message-blurred {
                filter: blur(8px) !important;
                user-select: none !important;
            }
            .messenger-guard-sidebar-indicator {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                background: #ff4444;
                border-radius: 50%;
                z-index: 10;
            }
        `;
        document.head.appendChild(style);
        this.styleSheet = style;
    }
    
    startMonitoring() {
        if (!document.body) {
            setTimeout(() => this.startMonitoring(), 1000);
            return;
        }
        
        try {
            this.observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                this.scanForNewMessages(node);
                                this.scanForSidebarMessages(node);
                            }
                        });
                    }
                });
            });
            
            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Initial scan
            this.scanForNewMessages(document.body);
            this.scanForSidebarMessages(document.body);
            
        } catch (error) {
            console.error('Error setting up MutationObserver:', error);
        }
    }
    
    getChatIdentifier(element) {
        const chatItem = element.closest('a[role="link"]') || 
                        element.closest('div[role="gridcell"]') || 
                        element.closest('[data-testid="mwthreadlist-item"]');
        
        if (!chatItem) return null;
        
        const ariaLabel = chatItem.getAttribute('aria-label');
        const href = chatItem.getAttribute('href');
        
        return ariaLabel || href || 'unknown';
    }
    
    scanForNewMessages(container) {
        // Simplified selectors - keep only the most reliable ones
        const messageSelectors = [
            '[data-testid="message-container"]',
            '[role="gridcell"] div[dir="auto"]'
        ];
        
        messageSelectors.forEach(selector => {
            const elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
            elements.forEach(element => {
                const text = this.extractText(element);
                if (text && text.length > 0) {
                    const messageId = this.generateMessageId(element, 'main');
                    this.analyzeMessage(text, messageId, element, 'main');
                }
            });
        });
    }
    
    scanForSidebarMessages(container) {
        // More comprehensive sidebar selectors to catch different Messenger layouts
        const sidebarMessageSelectors = [
            // Primary selectors for message preview text
            'a[role="link"] span[dir="auto"]:not(:first-child)', // Skip first span (usually name)
            'div[data-testid="mwthreadlist-item"] span[dir="auto"]:not(:first-child)',
            'div[role="gridcell"] a span[dir="auto"]:not(:first-child)',
            
            // Selectors for message preview containers
            'a[role="link"] div[style*="webkit-line-clamp"]',
            'a[role="link"] div[style*="-webkit-box"]',
            'a[role="link"] div[style*="line-clamp"]',
            
            // More generic selectors for different layouts
            '[aria-label*="Conversation"] span[dir="auto"]',
            'div[data-visualcompletion="ignore-dynamic"] a[role="link"] span[dir="auto"]',
            
            // Fallback selectors
            'ul[role="grid"] div[role="gridcell"] span[dir="auto"]',
            'div[aria-label*="Chats"] a span[dir="auto"]'
        ];
        
        // Create a Set to avoid processing the same element multiple times
        const processedElements = new Set();
        
        sidebarMessageSelectors.forEach(selector => {
            let elements;
            try {
                elements = container.querySelectorAll ? container.querySelectorAll(selector) : [];
            } catch (e) {
                console.warn('Invalid selector:', selector, e);
                return;
            }
            
            elements.forEach(element => {
                // Skip if already processed
                if (processedElements.has(element)) {
                    return;
                }
                processedElements.add(element);
                
                // Skip if it's a name element (bold text)
                if (this.isNameElement(element)) {
                    return;
                }
                
                // Additional checks to ensure we're getting the message preview
                const parent = element.closest('a[role="link"]') || element.closest('div[role="gridcell"]');
                if (!parent) return;
                
                // Check if this is actually a message preview by looking at the structure
                const isMessagePreview = this.isMessagePreviewElement(element);
                if (!isMessagePreview) return;
                
                const text = this.extractText(element);
                if (text && text.length > 0) {
                    const chatId = this.getChatIdentifier(element);
                    if (!chatId || chatId === 'unknown') return; // Skip if we can't identify the chat
                    
                    const messageId = this.generateMessageId(element, 'sidebar');
                    
                    // Debug logging (remove in production)
                    console.log('Sidebar message found:', {
                        text: text.substring(0, 50) + '...',
                        chatId: chatId,
                        selector: selector
                    });
                    
                    this.analyzeMessage(text, messageId, element, 'sidebar', chatId);
                }
            });
        });
    }

    // Add this helper method to the class
    isMessagePreviewElement(element) {
        // Check if element is likely a message preview based on its position and styling
        const parent = element.closest('a[role="link"]') || element.closest('div[role="gridcell"]');
        if (!parent) return false;
        
        // Get all text elements in the parent
        const textElements = parent.querySelectorAll('span[dir="auto"]');
        if (textElements.length < 2) return false; // Need at least name + message
        
        // Check if this element is after the first span (which is usually the name)
        let foundName = false;
        for (let el of textElements) {
            if (this.isNameElement(el)) {
                foundName = true;
            } else if (foundName && el === element) {
                // This is a text element after the name element
                return true;
            }
        }
        
        // Alternative check: Look for specific styling that indicates a message preview
        const computedStyle = window.getComputedStyle(element);
        const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
        
        // Message previews often have these characteristics
        if (parentStyle) {
            const hasLineClamp = parentStyle.webkitLineClamp || 
                            parentStyle.lineClamp || 
                            parentStyle.overflow === 'hidden';
            const hasEllipsis = parentStyle.textOverflow === 'ellipsis';
            
            if (hasLineClamp || hasEllipsis) {
                return true;
            }
        }
        
        // Check for specific classes or attributes that indicate message preview
        const classIndicators = ['message', 'preview', 'snippet', 'last-message'];
        const hasMessageClass = classIndicators.some(indicator => 
            element.className.toLowerCase().includes(indicator) ||
            (element.parentElement && element.parentElement.className.toLowerCase().includes(indicator))
        );
        
        return hasMessageClass;
    }
    
    // Also update the isNameElement method to be more accurate
    isNameElement(element) {
        // More comprehensive name detection
        const style = window.getComputedStyle(element);
        const fontWeight = style.fontWeight;
        
        // Check font weight
        if (fontWeight === 'bold' || 
            fontWeight === '700' || 
            fontWeight === '600' || 
            parseInt(fontWeight) >= 600) {
            return true;
        }
        
        // Check if it's the first text element in a chat item
        const parent = element.closest('a[role="link"]') || element.closest('div[role="gridcell"]');
        if (parent) {
            const textElements = parent.querySelectorAll('span[dir="auto"]');
            if (textElements.length > 0 && textElements[0] === element) {
                return true;
            }
        }
        
        // Check for specific aria-labels or roles that indicate a name
        if (element.getAttribute('aria-label')?.includes('name') ||
            element.closest('[aria-label*="name"]')) {
            return true;
        }
        
        return false;
    }
    
    extractText(element) {
        if (!element) 
            return '';
        
        // Simplified text extraction - remove only common unwanted elements
        const clone = element.cloneNode(true);
        const unwantedSelectors = [
            '[data-testid="message-timestamp"]',
            '.timestamp',
            'time'
        ];
        
        unwantedSelectors.forEach(selector => {
            clone.querySelectorAll(selector).forEach(el => el.remove());
        });
        
        return clone.textContent.trim();
    }
    
    generateMessageId(element, context = 'main') {
        const text = this.extractText(element);
        const position = Array.from(element.parentNode?.children || []).indexOf(element);
        
        return `${context}_msg_${text.substring(0, 20).replace(/\s/g, '_')}_${position}_${Date.now()}`;
    }
    
    async analyzeMessage(text, messageId, element, context = 'main', chatId = null) {
        if (!text || text.length < 2) 
            return;
        
        if (this.processedMessages.has(messageId)) {
            return;
        }
        
        try {
            this.processedMessages.add(messageId);
            this.pendingStorageUpdate = true;
            
            const result = await this.sendMessageSafely({
                action: 'analyzeMessage',
                text: text,
                messageId: messageId
            });
            
            if (result && result.shouldBlock) {
                if (context === 'sidebar' && chatId) {
                    this.blurredChats.set(chatId, true);
                    this.applyBlur(element, context); // <-- CORRECTED
                } else {
                    this.applyBlur(element, context); // <-- CORRECTED
                    const aiComment = result.details?.reason || result.reason || 'Thank you for choosing to stay away from harmful content. You deserve a pat on the back!';
                    showMessengerGuardPopup(result.severity, aiComment);
                }
            }
            
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }
    
    async batchSaveToStorage() {
        // Only save if there are pending updates
        if (!this.pendingStorageUpdate) return;
        
        try {
            await chrome.storage.local.set({
                processedMessageIds: Array.from(this.processedMessages),
                blurredChats: Array.from(this.blurredChats.entries())
            });
            this.pendingStorageUpdate = false;
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }
    
    applyBlur(element, context = 'main') {
        if (!element) 
            return;
        
        if (context === 'sidebar') {
            element.classList.add('messenger-guard-sidebar-message-blurred');
            
            const chatItem = element.closest('a[role="link"]') || 
                            element.closest('div[role="gridcell"]') || 
                            element.closest('[data-testid="mwthreadlist-item"]');
            
            if (chatItem && !chatItem.querySelector('.messenger-guard-sidebar-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'messenger-guard-sidebar-indicator';
                chatItem.style.position = 'relative';
                chatItem.appendChild(indicator);
            }
        } else {
            element.classList.add('messenger-guard-blurred');
        }
    }
    
    reapplyBlurStates() {
        this.blurredChats.forEach((isBlurred, chatId) => {
            if (isBlurred) {
                const chatItems = document.querySelectorAll('a[role="link"], div[role="gridcell"]');
                
                chatItems.forEach(chatItem => {
                    const currentChatId = this.getChatIdentifier(chatItem);
                    if (currentChatId === chatId) {
                        const messageElements = chatItem.querySelectorAll('span[dir="auto"]');
                        
                        messageElements.forEach(msgElement => {
                            if (!this.isNameElement(msgElement)) {
                                if (!msgElement.classList.contains('messenger-guard-sidebar-message-blurred')) {
                                    msgElement.classList.add('messenger-guard-sidebar-message-blurred');
                                }
                            }
                        });
                        
                        // Ensure indicator
                        if (!chatItem.querySelector('.messenger-guard-sidebar-indicator')) {
                            const indicator = document.createElement('div');
                            indicator.className = 'messenger-guard-sidebar-indicator';
                            chatItem.style.position = 'relative';
                            chatItem.appendChild(indicator);
                        }
                    }
                });
            }
        });
    }
    
    async sendMessageSafely(message) {
        try {
            if (!this.isExtensionContextValid()) {
                console.warn('Extension context invalid, skipping message send');
                return null;
            }
            
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            console.error('Error sending message:', error);
            return null;
        }
    }
    
    isExtensionContextValid() {
        return typeof chrome !== 'undefined' && 
               chrome.runtime &&
               typeof chrome.runtime.sendMessage === 'function';
    }
    
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.styleSheet && this.styleSheet.parentNode) {
            this.styleSheet.parentNode.removeChild(this.styleSheet);
        }
    }
}

// Initialize when document is ready
function initializeMessengerGuard() {
    if (window.messengerGuard) {
        window.messengerGuard.destroy();
    }
    
    window.messengerGuard = new MessengerGuardWithBlur();
}

// Popup function
function showMessengerGuardPopup(_severity, aiComment) {
    const existing = document.getElementById('messenger-guard-popup');
    if (existing) 
        existing.remove();

    const popup = document.createElement('div');
    popup.id = 'messenger-guard-popup';

    popup.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="
                background: rgba(255, 255, 255, 0.95);
                border-radius: 20px;
                padding: 15px 20px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                max-width: 300px;
                position: relative;
            ">
                <div style="
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                    font-size: 14px;
                    color: #333;
                    line-height: 1.5;
                ">
                    <div style="
                        font-weight: 600;
                        color: #28a745;
                        margin-bottom: 5px;
                        font-size: 16px;
                    ">UH OH!</div>
                    <div>${aiComment || 'Thank you for choosing to stay away from harmful content. You deserve a pat on the back!'}</div>
                </div>
            </div>
            <img src="${chrome.runtime.getURL('assets/uhoh.png')}" alt="AI Bot" 
                style="width: 120px; height: 120px; object-fit: contain;">
        </div>
    `;

    Object.assign(popup.style, {
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        zIndex: '99999',
        animation: 'slideInUp 0.4s ease-out',
    });

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInUp {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.style.transition = 'all 0.4s ease';
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(20px)';
        setTimeout(() => {
            popup.remove();
            style.remove();
        }, 400);
    }, 10000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMessengerGuard);
} else {
    initializeMessengerGuard();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        initializeMessengerGuard();
    }
});
