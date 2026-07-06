const DEFAULT_HEALTH_URL = 'https://bantai-backend.vercel.app/api/health';

function getHealthUrl() {
    const fromEnv = process.env.BACKEND_HEALTHCHECK_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
        return fromEnv.trim();
    }

    return DEFAULT_HEALTH_URL;
}

async function run() {
    const url = getHealthUrl();
    console.log(`Running health check: ${url}`);

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
    } catch (error) {
        throw new Error(`Health check request failed: ${error.message}`);
    }

    if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
    }

    let body;
    try {
        body = await response.json();
    } catch (_error) {
        throw new Error('Health check response is not valid JSON.');
    }

    if (body.status !== 'ok') {
        throw new Error(`Unexpected health payload status: ${body.status || 'undefined'}`);
    }

    console.log('Health check passed.');
}

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
