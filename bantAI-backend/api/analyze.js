// File: analyze.js - UNIFIED AND CORRECTED

const { EmailClient } = require('@azure/communication-email');
const express = require('express');
const cors = require('cors');

const app = express();

const DEFAULT_ALLOWED_ORIGIN = 'chrome-extension://jldakfeglcjcjaidpckbeiofibemfcmd';

function getEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

function parseCsv(value) {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const DEFAULT_SYSTEM_PROMPT = `You are BantAI Buddy, a child-safety classifier for chat messages on Messenger and Instagram. Your audience is children ages 8–15, especially communities in Cebu, Philippines. You understand English, Tagalog, Cebuano, Taglish, and Conyo (mixed casual Filipino-English).

CLASSIFICATION RULES
- Analyze the message carefully before deciding. Do not flag harmless or ambiguous messages as inappropriate.
- Watch for: flirtation, sexual content, profanity, insults, hate speech, racism, predatory grooming, violence, cyberbullying, misinformation, and evasion tactics (number/symbol substitutions, deliberate misspellings, leetspeak).
- Use category SAFE when the message is appropriate for children.
- Set action to BLOCK only when the message is genuinely inappropriate for ages 8–15. Use ALLOW for friendly, benign, or unclear messages.
- severity scale: 1 = none/safe, 2 = mild concern, 3 = moderate, 4 = high, 5 = critical. Match severity to action (BLOCK usually means severity 2 or higher).

REASON FIELD (shown to the child in a popup)
- Write exactly TWO short sentences, friendly and age-appropriate. Open with a warm greeting (e.g. "Hey there!" / "Uy, friend!" / "Oy, bai!").
- Write the reason in the same language as the message (English, Tagalog, or Cebuano). For Cebuano, use casual everyday Bisaya, not formal textbook Cebuano.
- If you mention inappropriate words, censor them with asterisks (e.g. tangina → t******).
- Be creative and encouraging, not scary or preachy.

OTHER FIELDS
- language: detected primary language (English, Tagalog, or Cebuano).
- confidence: your confidence from 0.0 to 1.0.
- slang_detected: comma-separated slang or coded terms found, or empty string if none.

OUTPUT
- Return ONLY a JSON object matching the enforced schema. No markdown, no code fences, no extra text.`;

const ANALYSIS_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        action: {
            type: 'STRING',
            enum: ['ALLOW', 'BLOCK']
        },
        category: {
            type: 'STRING',
            enum: [
                'SAFE',
                'INSULT',
                'TOXICITY',
                'SEVERE_TOXICITY',
                'SEXUALLY_EXPLICIT',
                'FLIRTATION',
                'PROFANITY',
                'PREDATORY',
                'VIOLENCE',
                'MISINFORMATION',
                'HATE_SPEECH',
                'CYBERBULLYING'
            ]
        },
        reason: { type: 'STRING' },
        severity: { type: 'INTEGER' },
        language: {
            type: 'STRING',
            enum: ['English', 'Tagalog', 'Cebuano']
        },
        confidence: { type: 'NUMBER' },
        slang_detected: { type: 'STRING' }
    },
    required: ['action', 'category', 'reason', 'severity', 'language']
};

function extractJsonPayload(content) {
    if (typeof content !== 'string') {
        return '';
    }

    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
        return fenced[1].trim();
    }

    const trimmed = content.trim();
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');

    if (objectStart !== -1 && objectEnd > objectStart) {
        return trimmed.slice(objectStart, objectEnd + 1);
    }

    return trimmed;
}

function parseAnalysisPayload(payload) {
    try {
        return JSON.parse(payload);
    } catch (error) {
        console.error('Failed to parse model JSON. Raw content (truncated):', payload.slice(0, 800));
        throw error;
    }
}

function normalizeAnalysis(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const severityNum = Number(source.severity);
    const severity = Number.isFinite(severityNum)
        ? Math.max(1, Math.min(5, Math.round(severityNum)))
        : 1;

    const modelAction = String(source.action || '').toUpperCase();
    const action = modelAction === 'BLOCK' || severity >= 2 ? 'BLOCK' : 'ALLOW';
    const category = String(source.category || 'UNKNOWN').trim() || 'UNKNOWN';
    const reason = String(source.reason || 'No reason provided by model.').trim() || 'No reason provided by model.';

    const analysis = {
        action,
        category,
        reason,
        severity,
        child_risk: severity >= 5 ? 'CRITICAL' : severity >= 4 ? 'HIGH' : severity >= 3 ? 'MEDIUM' : severity >= 2 ? 'LOW' : 'NONE'
    };

    if (source.language) {
        analysis.language = String(source.language).trim();
    }

    const confidence = Number(source.confidence);
    if (Number.isFinite(confidence)) {
        analysis.confidence = Math.max(0, Math.min(1, confidence));
    }

    if (source.slang_detected !== undefined && source.slang_detected !== null) {
        analysis.slang_detected = String(source.slang_detected).trim();
    }

    return analysis;
}

const config = {
    allowedOrigins: parseCsv(getEnv('ALLOWED_EXTENSION_ORIGINS', 'ALLOWED_ORIGINS')).length > 0
        ? parseCsv(getEnv('ALLOWED_EXTENSION_ORIGINS', 'ALLOWED_ORIGINS'))
        : [DEFAULT_ALLOWED_ORIGIN],
    email: {
        connectionString: getEnv('ACS_CONNECTION_STRING'),
        senderAddress: getEnv('ACS_SENDER_ADDRESS')
    },
    model: {
        systemPrompt: getEnv('GEMINI_SYSTEM_PROMPT') || DEFAULT_SYSTEM_PROMPT,
        geminiApiKey: getEnv('GEMINI_API_KEY', 'GOOGLE_API_KEY'),
        geminiModel: getEnv('GEMINI_MODEL') || 'gemini-2.5-flash',
        geminiEndpoint: getEnv('GEMINI_ENDPOINT') || 'https://generativelanguage.googleapis.com/v1beta',
        geminiSafetyThreshold: getEnv('GEMINI_SAFETY_THRESHOLD') || 'BLOCK_MEDIUM_AND_ABOVE'
    }
};

function validateConfig() {
    const missing = [];

    if (!config.model.geminiApiKey) missing.push('GEMINI_API_KEY (or GOOGLE_API_KEY)');
    if (!config.model.geminiModel) missing.push('GEMINI_MODEL');

    if (missing.length > 0) {
        throw new Error(`Configuration error: ${missing.join(', ')}`);
    }
}

validateConfig();

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '128kb' }));

// Initialize clients
const emailClient = config.email.connectionString && config.email.senderAddress
    ? new EmailClient(config.email.connectionString)
    : null;

function buildUserPrompt(messageText) {
    return `Analyze this chat message for child safety (ages 8–15): "${messageText}"`;
}

async function analyzeWithGemini(messageText) {
    const requestUrl = `${config.model.geminiEndpoint.replace(/\/$/, '')}/models/${encodeURIComponent(config.model.geminiModel)}:generateContent?key=${encodeURIComponent(config.model.geminiApiKey)}`;
    const safetyThreshold = config.model.geminiSafetyThreshold;

    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: config.model.systemPrompt }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: buildUserPrompt(messageText) }]
                }
            ],
            generationConfig: {
                temperature: 0,
                topP: 0.95,
                maxOutputTokens: 800,
                responseMimeType: 'application/json',
                responseSchema: ANALYSIS_RESPONSE_SCHEMA
            },
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    threshold: safetyThreshold
                },
                {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    threshold: safetyThreshold
                },
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    threshold: safetyThreshold
                },
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: safetyThreshold
                }
            ]
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${text.slice(0, 600)}`);
    }

    const body = await response.json();
    if (body?.promptFeedback?.blockReason) {
        const error = new Error(`Gemini prompt blocked by safety policy: ${body.promptFeedback.blockReason}`);
        error.code = 'content_filter';
        throw error;
    }

    const firstCandidate = body?.candidates?.[0];
    if (firstCandidate?.finishReason === 'SAFETY') {
        const error = new Error('Gemini response blocked by safety policy.');
        error.code = 'content_filter';
        throw error;
    }

    const parts = body?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts) || parts.length === 0) {
        throw new Error('Gemini API returned no text parts.');
    }

    return parts
        .map(part => (typeof part?.text === 'string' ? part.text : ''))
        .join('\n')
        .trim();
}

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        provider: 'gemini',
        deployment: config.model.geminiModel,
        emailNotificationsEnabled: Boolean(emailClient)
    });
});

// --- SINGLE, UNIFIED ENDPOINT FOR ANALYSIS AND NOTIFICATION ---
app.post('/api/analyze', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : null;

    if (!body) {
        return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }

    const { parentEmail, messageText, context } = body;
    const requestContext = context === 'sidebar' ? 'sidebar' : 'main';

    if (!messageText) {
        return res.status(400).json({ error: 'Message text is required.' });
    }

    try {
        const content = await analyzeWithGemini(messageText);
        const payload = extractJsonPayload(content);

        if (!payload) {
            throw new Error('Model returned empty content.');
        }

        const analysis = normalizeAnalysis(parseAnalysisPayload(payload));

        const shouldBlock = analysis.action === 'BLOCK' || analysis.severity >= 2;

        // --- EMAIL LOGIC IS NOW INSIDE THIS UNIFIED ENDPOINT ---
        // If the message is severe AND a parent email was provided, send the notification.
        if (shouldBlock && analysis.severity >= 3 && parentEmail && requestContext === 'main' && emailClient) {
            console.log(`High severity detected. Preparing email for ${parentEmail}`);

            const emailMessage = {
                senderAddress: config.email.senderAddress,
                recipients: {
                    to: [{ address: parentEmail }],
                },
                content: {
                    subject: `🚨 BantAI Buddy Alert! Message Detected (Severity: ${analysis.severity}, Category: ${analysis.category})`,
                    html: `
                        <html>
                        <body style="font-family: sans-serif; line-height: 1.6;">
                            <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                                <h2 style="color: #d9534f;">🚨 BantAI Buddy Alert! 🚨</h2>
                                <p>Dear Parent/Guardian,</p>
                                <p>This is an urgent notification from <b>BantAI Buddy</b>. A message with a <b>threat level of ${analysis.severity} and a category of ${analysis.category}</b> has been detected.</p>
                                
                                <h3 style="color: #333;">Message Details:</h3>
                                <p><strong>Reason for detection:</strong> <i>"${escapeHtml(analysis.reason)}"</i></p>
                                <p style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 4px; color: #721c24;">
                                    <strong>Original Message:</strong> "${escapeHtml(messageText)}"
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
            
            
            // Send the email but don't wait for it to finish.
            // This makes the response to the extension faster.
            emailClient.beginSend(emailMessage)
                .then(poller => console.log(`Email send initiated to ${parentEmail}, ID: ${poller.getOperationState().id}`))
                .catch(err => console.error("ACS Email Sending Error:", err));
        } else if (shouldBlock && analysis.severity >= 3 && requestContext === 'sidebar') {
            console.log(`High severity detected in sidebar - no email sent per configuration`);
        } else if (shouldBlock && analysis.severity >= 3 && parentEmail && requestContext === 'main' && !emailClient) {
            console.warn('High severity detected but email client is not configured.');
        }

        // Return the analysis result to the extension immediately.
        res.status(200).json({
            shouldBlock: shouldBlock,
            analysis: analysis
        });

    } catch (error) {
        console.error('Backend Analysis Error:', error);

        if (error.code === 'content_filter') {
            res.status(200).json({
                shouldBlock: true,
                analysis: {
                    action: 'BLOCK',
                    category: 'CONTENT_FILTER',
                    reason: "This message was blocked by BantAI Buddy's content safety filter.",
                    severity: 5,
                    child_risk: 'CRITICAL',
                    shouldBlock: true
                }
            });
        } else if (error instanceof SyntaxError) {
            res.status(200).json({
                shouldBlock: false,
                analysis: {
                    action: 'ALLOW',
                    category: 'MODEL_OUTPUT_ERROR',
                    reason: 'Hey there! We could not fully check this message right now, so we are letting it through. If something feels off, please tell a trusted adult.',
                    severity: 1,
                    child_risk: 'NONE'
                }
            });
        } else {
            res.status(500).json({ error: 'Failed to analyze message.' });
        }
    }
});


// The '/send-notification' endpoint is no longer needed.
// You can delete it. The app.listen() part is also not needed for Vercel.

module.exports = app;