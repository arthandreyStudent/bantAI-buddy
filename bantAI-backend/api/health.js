// File: bantAI-backend/api/health.js

function getEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

module.exports = async function healthHandler(_req, res) {
    const provider = 'llama.cpp';
    const deployment = getEnv('LOCAL_LLM_MODEL_NAME') || 'qwen/qwen3-4b';
    const localEndpoint = getEnv('LOCAL_LLM_ENDPOINT') || 'http://localhost:8080/v1/chat/completions';

    const emailNotificationsEnabled = Boolean(
        getEnv('ACS_CONNECTION_STRING') && getEnv('ACS_SENDER_ADDRESS')
    );

    let endpointConnected = false;
    try {
        // Derive the models or generic health endpoint from the configured completions path
        const pingUrl = localEndpoint.replace(/\/chat\/completions$/, '/models');
        
        // Quick 2-second timeout fetch to keep the health check snappy
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const pingResponse = await fetch(pingUrl, { 
            method: 'GET',
            signal: controller.signal 
        }).catch(() => ({ ok: false }));
        
        clearTimeout(timeoutId);
        endpointConnected = pingResponse.ok;
    } catch (e) {
        endpointConnected = false;
    }

    return res.status(200).json({
        status: 'ok',
        provider,
        deployment,
        endpointConnected,
        emailNotificationsEnabled,
        timestamp: new Date().toISOString()
    });
};