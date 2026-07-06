function getEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

module.exports = function healthHandler(_req, res) {
    const provider = 'gemini';
    const deployment = getEnv('GEMINI_MODEL') || 'gemini-2.5-flash';

    const emailNotificationsEnabled = Boolean(
        getEnv('ACS_CONNECTION_STRING') && getEnv('ACS_SENDER_ADDRESS')
    );

    return res.status(200).json({
        status: 'ok',
        provider,
        deployment,
        emailNotificationsEnabled,
        timestamp: new Date().toISOString()
    });
};
