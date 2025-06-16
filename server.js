const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Vision = require('@hapi/vision');
const HapiSwagger = require('hapi-swagger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { verifyToken } = require('./utils/middleware');


const init = async () => {
    // Render will provide PORT automatically via environment variable
    const port = process.env.PORT || 10000;

    const server = Hapi.server({
        port: port,
        host: '0.0.0.0', // Required by Render for public HTTP binding
        routes: {
            cors: {
                origin: ['*'], // Optional: allows requests from any origin
            },
        },
    });

    const swaggerOptions = {
        info: {
            title: '📘 LMS Auth API',
            version: '1.0.0',
        },
        documentationPath: '/',
        grouping: 'tags',
    };

    await server.register([
        Inert,
        Vision,
        { plugin: HapiSwagger, options: swaggerOptions },
    ]);
    server.auth.scheme('custom-jwt', function () {
        return {
            authenticate: async function (request, h) {
                await verifyToken(request, h); // inject ke request.auth
                return h.authenticated({ credentials: request.auth.credentials });
            },
        };
    });

    server.auth.strategy('jwt', 'custom-jwt');
    // Auto-load all route plugins from the /routes folder
    const routeFiles = fs.readdirSync(path.join(__dirname, 'routes'))
        .filter(f => f.endsWith('.js'));

    for (const file of routeFiles) {
        const plugin = require(path.join(__dirname, 'routes', file));
        await server.register(plugin);
    }



    await server.start();
    console.log(`🚀 Server running at: ${server.info.uri}`);
};

process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
});

init();
