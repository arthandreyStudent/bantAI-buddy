const GEMINI_REQUIRED_GROUPS = [
    ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
];

const GEMINI_ALLOWED_SAFETY_THRESHOLDS = new Set([
    'OFF',
    'BLOCK_NONE',
    'BLOCK_ONLY_HIGH',
    'BLOCK_MEDIUM_AND_ABOVE',
    'BLOCK_LOW_AND_ABOVE'
]);

function hasValue(name) {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
}

function firstAvailable(names) {
    return names.find(hasValue);
}

function printGroupStatus(names) {
    const selected = firstAvailable(names);
    if (selected) {
        console.log(`OK: ${selected}`);
    } else {
        console.error(`MISSING: one of [${names.join(', ')}]`);
    }
    return Boolean(selected);
}

function validateModelConfig() {
    const requiredOk = GEMINI_REQUIRED_GROUPS.every(printGroupStatus);
    if (hasValue('GEMINI_MODEL')) {
        console.log('OK: GEMINI_MODEL');
    } else {
        console.warn('WARN: GEMINI_MODEL not set. Backend default model gemini-2.5-flash will be used.');
    }

    if (hasValue('GEMINI_SAFETY_THRESHOLD')) {
        const threshold = String(process.env.GEMINI_SAFETY_THRESHOLD).trim().toUpperCase();
        if (GEMINI_ALLOWED_SAFETY_THRESHOLDS.has(threshold)) {
            console.log('OK: GEMINI_SAFETY_THRESHOLD');
            return requiredOk;
        }

        console.error('MISSING: GEMINI_SAFETY_THRESHOLD must be one of OFF, BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE.');
        return false;
    }

    console.warn('WARN: GEMINI_SAFETY_THRESHOLD not set. Backend default BLOCK_MEDIUM_AND_ABOVE will be used.');
    return requiredOk;
}

function validateEmailConfig() {
    const hasConnection = hasValue('ACS_CONNECTION_STRING');
    const hasSender = hasValue('ACS_SENDER_ADDRESS');

    if (hasConnection !== hasSender) {
        console.error('MISSING: ACS_CONNECTION_STRING and ACS_SENDER_ADDRESS must be provided together.');
        return false;
    }

    if (hasConnection && hasSender) {
        console.log('OK: Email notifications configured.');
    } else {
        console.warn('WARN: Email notifications disabled (ACS vars not set).');
    }

    return true;
}

function validateOptionalHints() {
    if (!hasValue('ALLOWED_EXTENSION_ORIGINS') && !hasValue('ALLOWED_ORIGINS')) {
        console.warn('WARN: ALLOWED_EXTENSION_ORIGINS/ALLOWED_ORIGINS not set. Backend default allowlist will be used.');
    }

    if (!hasValue('GEMINI_SYSTEM_PROMPT')) {
        console.warn('WARN: No custom system prompt configured. Backend default prompt will be used.');
    }
}

console.log('Validating backend runtime environment contract...');
console.log('AI provider: gemini');

const requiredOk = validateModelConfig();
const emailOk = validateEmailConfig();
validateOptionalHints();

if (!requiredOk || !emailOk) {
    process.exitCode = 1;
    console.error('Environment validation failed.');
} else {
    console.log('Environment validation passed.');
}
