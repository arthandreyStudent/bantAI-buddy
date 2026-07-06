// File: linkEmail.js

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

    // Keep apiKeyIsSet for backward compatibility with existing users.
    chrome.storage.local.set({
        storedEmail: emailAddress,
        setupComplete: true,
        apiKeyIsSet: true
    });

    console.log("Sending message to background script to schedule tab reload.");
    chrome.runtime.sendMessage({ action: 'reloadTabAfterDelay' });

    spinner.classList.remove('visible');
    successText.classList.remove('visible');
    spinner.classList.add('visible');

    setTimeout(() => {
        spinner.classList.remove('visible');
        successText.classList.add('visible');

        setTimeout(() => {
            window.location.href = 'activate.html';
        }, 1000);

    }, 1000);
    
});