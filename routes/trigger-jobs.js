module.exports = {
    name: 'trigger-jobs',
    version: '1.0.0',
    register: async function (server) {
        server.route({
            method: 'POST',
            path: '/trigger-jobs',
            options: {
                auth: false,
                description: 'Manual trigger worker generate-sessions',
                tags: ['api', 'Worker'],
            },
            handler: async (request, h) => {
                const { exec } = require('child_process');
                const path = require('path');

                const workerPath = path.join(__dirname, '../worker/generate-sessions-worker.js');

                exec(`node ${workerPath}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Exec error: ${error}`);
                        return;
                    }
                    if (stderr) {
                        console.error(`Stderr: ${stderr}`);
                    }
                    console.log(`Stdout: ${stdout}`);
                });

                return h.response({ message: 'Worker di-trigger.' });
            },
        });
    },
};
