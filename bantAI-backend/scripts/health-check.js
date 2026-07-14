// File: bantAI-backend/scripts/health-check.js

// const DEFAULT_HEALTH_URL = 'https://bantai-backend.vercel.app/api/health';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const DEFAULT_HEALTH_URL = 'http://localhost:3000/api/health';

function getHealthUrl() {
    const fromEnv = process.env.BACKEND_HEALTHCHECK_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
        return fromEnv.trim();
    }
    return DEFAULT_HEALTH_URL;
}

async function run() {
    const url = getHealthUrl();
    console.log(`[Smoke Test] Pinging health gateway: ${url}`);

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
    } catch (error) {
        throw new Error(`Smoke check connection failed: ${error.message}`);
    }

    if (!response.ok) {
        throw new Error(`Smoke check rejected with HTTP status: ${response.status}`);
    }

    let body;
    try {
        body = await response.json();
    } catch (_error) {
        throw new Error('Smoke check returned an invalid non-JSON payload.');
    }

    if (body.status !== 'ok') {
        throw new Error(`Unexpected health diagnostic status: ${body.status}`);
    }

    console.log(`[Smoke Test] Success! Core: ${body.provider} | LLM Engine Online: ${body.endpointConnected}`);
}

run().catch((error) => {
    console.error(`[Smoke Test Failed] ${error.message}`);
    process.exitCode = 1;
});
