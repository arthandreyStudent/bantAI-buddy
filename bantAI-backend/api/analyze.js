const { AzureOpenAI } = require('openai');
const { EmailClient } = require('@azure/communication-email');
const express = require('express');
const cors = require('cors');

const app = express();

const allowedOrigin = 'chrome-extension://njoiafmdimmljbmnnnajddalgjnklbdi';

const corsOptions = {
    origin: function (origin, callback) {
        if (origin == allowedOrigin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json());

// --- SECURELY GET KEYS FROM ENVIRONMENT VARIABLES ---
const connectionString = process.env["ACS_CONNECTION_STRING"];
const senderAddress = process.env["ACS_SENDER_ADDRESS"];
const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const apiKey = process.env["AZURE_OPENAI_API_KEY"];
const apiVersion = "2025-01-01-preview";
const deployment = process.env["AZURE_DEPLOYMENT_NAME"] || 'gpt-35-turbo';
const SYSTEM_PROMPT = process.env["AZURE_OPENAI_SYSTEM_PROMPT"];

if (!connectionString || !senderAddress) {
    console.error('ERROR: Azure Communication Service details (ACS_CONNECTION_STRING, ACS_SENDER_ADDRESS) are not set in environment variables.');
    process.exit(1);
}

const emailClient = new EmailClient(connectionString);
const openAIClient = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

//ENDPOINT FOR VERCEL TO ANALYZE MESSAGES
app.post('/api/analyze', async (req, res) => {
    const { messageText } = req.body;

    if (!messageText) {
        return res.status(400).json({ error: 'Message text is required.' });
    }

    try {
        const result = await openAIClient.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Analyze: "${messageText}"` }
            ],
            max_tokens: 800,
            temperature: 0.3,
        });

        const content = result.choices[0].message.content;
        const cleaned = content.replace(/^```JSON\s*|\s*```$/g, '').trim();
        const analysis = JSON.parse(cleaned);

        const shouldBlock = analysis.action === 'BLOCK' || analysis.severity >= 2;

        res.status(200).json({
            shouldBlock: shouldBlock,
            analysis: analysis
        });

    } catch (error) {
        console.error('Backend Analysis Error:', error);
        res.status(500).json({ error: 'Failed to analyze message.' });
    }
});

// ENDPOINT TO SEND NOTIFICATION EMAILS
app.post('/send-notification', async (req, res) => {
    console.log('Received request for /send-notification');

    const { email, threatLevel, riskType, reason, originalText } = req.body;

    if (!email || threatLevel === undefined || !reason || !originalText) { // threatLevel can be 0, so check for undefined
        console.warn('Missing required fields in request body. Email, threatLevel, reason, or originalText are missing.');
        return res.status(400).json({ message: "Please provide 'email', 'threatLevel', 'reason', and 'originalText'." });
    }

    try {
        console.log('Attempting to send email via Azure Communication Services...');

        const emailMessage = {
            senderAddress: senderAddress, // Use the sender address from your ACS setup
            recipients: {
                to: [{ address: email }],
            },
            content: {
                subject: `🚨 BantAI Buddy Alert! Message Detected (Severity: ${threatLevel}, Category: ${riskType})`,
                html: `
                    <html>
                    <body style="font-family: sans-serif; line-height: 1.6;">
                        <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                            <h2 style="color: #d9534f;">🚨 BantAI Buddy Alert! 🚨</h2>
                            <p>Dear Parent/Guardian,</p>
                            <p>This is an urgent notification from <b>BantAI Buddy</b>. A message with a <b>threat level of ${threatLevel} and a category of ${riskType}</b> has been detected.</p>
                            
                            <h3 style="color: #333;">Message Details:</h3>
                            <p><strong>Reason for detection:</strong> ${reason}</p>
                            <p style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 4px; color: #721c24;">
                                <strong>Original Message:</strong> "${originalText}"
                            </p>
                            
                            <p><b>This may not have been the first time your child has engaged with harmful texts.<b> Please consider having a conversation with your child about safe online communication. You can also review more details within the <b>BantAI Buddy</b> extension.</p>

                            <p>We are constantly working to make BantAI Buddy as accurate as possible, and your feedback is a vital part of that process. If you believe this message was blocked by mistake, or if you have any suggestions for improvement, please reply directly to this email. We appreciate positive stories too! Knowing what we're doing right helps us just as much.</p>
                            
                            <p>Thank you for using <b>BantAI Buddy</b> to keep your children safe online.</p>

                            <p style="font-size: 0.9em; color: #888;">The BantAI Buddy Team</p>
                        </div>
                    </body>
                    </html>
                `
            },
        };

        // Use the ACS Email client to send the email
        const poller = await emailClient.beginSend(emailMessage);
        const response = await poller.pollUntilDone();

        console.log('Email send operation ID:', response.id);

        if (response.status === "Succeeded") {
            console.log('Email sent successfully via Azure Communication Services.');
            res.status(200).json({ success: true, message: "Email notification sent successfully via ACS.", messageId: response.id });
        } else {
            console.error(`ACS Email send operation status: ${response.status}. Error details:`, response.error);
            res.status(500).json({ success: false, message: `An error occurred while sending email via ACS: ${response.error?.message || response.status}` });
        }

    } catch (error) {
        console.error('Error sending email via Azure Communication Services:', error.message);
        res.status(500).json({ success: false, message: `An error occurred while sending email: ${error.message}` });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;