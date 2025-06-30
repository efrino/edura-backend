const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '..', 'logs', 'activity.log');

function logActivity(label, message) {
  const timestamp = new Date().toISOString();
  const content = `[${timestamp}] [${label}] ${message}\n`;
  fs.appendFile(logFilePath, content, (err) => {
    if (err) console.error('[Logger Error]', err);
  });
}

module.exports = { logActivity };
