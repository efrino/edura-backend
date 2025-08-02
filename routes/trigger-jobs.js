// // module.exports = {
// //     name: 'trigger-jobs',
// //     version: '1.0.0',
// //     register: async function (server) {
// //         server.route({
// //             method: 'POST',
// //             path: '/trigger-jobs',
// //             options: {
// //                 auth: false,
// //                 description: 'Manual trigger worker generate-sessions',
// //                 tags: ['api', 'Worker'],
// //             },
// //             handler: async (request, h) => {
// //                 const { exec } = require('child_process');
// //                 const path = require('path');

// //                 const workerPath = path.join(__dirname, '../worker/generate-sessions-worker.js');

// //                 exec(`node ${workerPath}`, (error, stdout, stderr) => {
// //                     if (error) {
// //                         console.error(`Exec error: ${error}`);
// //                         return;
// //                     }
// //                     if (stderr) {
// //                         console.error(`Stderr: ${stderr}`);
// //                     }
// //                     console.log(`Stdout: ${stdout}`);
// //                 });

// //                 return h.response({ message: 'Worker di-trigger.' });
// //             },
// //         });
// //     },
// // };
// const runWorker = require('../worker/generate-sessions-worker');

// module.exports = {
//     name: 'trigger-jobs',
//     version: '1.0.0',
//     register: async function (server) {
//         server.route({
//             method: 'POST',
//             path: '/trigger-jobs',
//             options: {
//                 auth: false,
//                 description: 'Manual trigger worker generate-sessions',
//                 tags: ['api', 'Worker'],
//             },
//             handler: async (request, h) => {
//                 try {
//                     await runWorker(); // ⬅️ langsung panggil worker
//                     return h.response({ message: 'Worker selesai diproses' });
//                 } catch (err) {
//                     console.error('Worker error:', err);
//                     return h.response({ error: 'Worker gagal' }).code(500);
//                 }
//             },
//         });
//     },
// };
const runWorker = require('../worker/generate-sessions-worker');

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
            // Handler tidak perlu async lagi
            handler: (request, h) => {
                // "Fire-and-forget": Panggil worker tanpa menunggu selesai
                runWorker();

                // Langsung berikan respons bahwa trigger telah diterima
                const response = {
                    statusCode: 202,
                    message: 'Accepted',
                    details: 'Worker trigger has been received and is being processed in the background.'
                };

                // Gunakan status code 202 (Accepted)
                return h.response(response).code(202);
            },
        });
    },
};