// File: bantAI-backend/scripts/validate-env.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

function hasValue(name) {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
}

function validateModelConfig() {
    let isValid = true;

    if (hasValue('LOCAL_LLM_ENDPOINT')) {
        console.log(`OK: LOCAL_LLM_ENDPOINT -> ${process.env.LOCAL_LLM_ENDPOINT}`);
    } else {
        console.warn('WARN: LOCAL_LLM_ENDPOINT not set. Defaulting to http://localhost:8080/v1/chat/completions');
    }

    if (hasValue('LOCAL_LLM_MODEL_NAME')) {
        console.log(`OK: LOCAL_LLM_MODEL_NAME -> ${process.env.LOCAL_LLM_MODEL_NAME}`);
    } else {
        console.warn('WARN: LOCAL_LLM_MODEL_NAME not set. Defaulting to Qwen3-4B');
    }

    return isValid;
}

function validateEmailConfig() {
    const hasConnection = hasValue('ACS_CONNECTION_STRING');
    const hasSender = hasValue('ACS_SENDER_ADDRESS');

    if (hasConnection !== hasSender) {
        console.error('ERROR: ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS must be provided together.');
        return false;
    }

    if (hasConnection && hasSender) {
        console.log('OK: Parental Email notifications configured via Azure.');
    } else {
        console.warn('WARN: Parental email alerts are disabled (ACS variables missing).');
    }

    return true;
}

console.log('Validating BantAI Backend local environment contract...');
console.log('Target Core: llama.cpp Multi-Intercept Pipeline');
console.log('--------------------------------------------------');

const coreOk = validateModelConfig();
const emailOk = validateEmailConfig();

console.log('--------------------------------------------------');
if (!coreOk || !emailOk) {
    process.exitCode = 1;
    console.error('Environment validation failed.');
} else {
    console.log('Environment validation passed. Ready for runtime.');
}