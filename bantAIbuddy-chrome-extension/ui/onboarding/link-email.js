// File: bantAIbuddy-chrome-extension/ui/onboarding/link-email.js

const confirmButton = document.getElementById("confirmButton");
const spinner = document.getElementById("spinner");
const successText = document.getElementById("successMessage");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

confirmButton.addEventListener('click', () => {
    const emailAddress = document.getElementById("emailAddress").value.trim();
    
    if (!emailAddress || !EMAIL_REGEX.test(emailAddress)) {
        alert("Please enter a valid email address.");
        return;
    }

    // Toggle interactive animation UI states
    spinner.classList.add('visible');
    successText.classList.remove('visible');

    // Persist configurations cleanly without old cloud variables
    chrome.storage.local.set({
        storedEmail: emailAddress,
        setupComplete: true
    }, () => {
        console.log("[BantAI Onboarding] Core configuration parameters committed to local storage.");
        
        // Command background network to reload open tab panels safely
        chrome.runtime.sendMessage({ action: 'reloadTabAfterDelay' });

        setTimeout(() => {
            spinner.classList.remove('visible');
            successText.classList.add('visible');

            setTimeout(() => {
                window.location.href = 'activate.html';
            }, 1000);
        }, 1200);
    });
});