// File: linkApiKey.js

const confirmButton = document.getElementById("confirmButton");
const spinner = document.getElementById("spinner");
const successText = document.getElementById("successMessage");

confirmButton.addEventListener('click', () => {
    const emailAddress = document.getElementById("emailAddress").value.trim();
    
    // You might want to add validation for the phone number format
    if (!emailAddress) {
        alert("Please enter a valid mobile number.");
        return;
    }

    // Save the phone number and set the activated flag
    chrome.storage.local.set({
        storedEmail: emailAddress,
        apiKeyIsSet: true // We still use this flag to know the setup is done
    });

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