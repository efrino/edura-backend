function logActivity(action, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${action}] ${message}`;
    console.log(logMessage);
}

module.exports = { logActivity };
