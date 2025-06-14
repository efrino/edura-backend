const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Vision = require('@hapi/vision');
const HapiSwagger = require('hapi-swagger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const init = async () => {
    const server = Hapi.server({
        port: process.env.PORT || 3000,
        host: 'localhost',
        routes: { cors: true },
    });

    const swaggerOptions = {
        info: {
            title: '📘 LMS Auth API',
            version: '1.0.0',
        },
        documentationPath: '/', // Swagger UI at root
        grouping: 'tags',        // ⬅️ Grouping berdasarkan tag
    };

    await server.register([
        Inert,
        Vision,
        { plugin: HapiSwagger, options: swaggerOptions },
    ]);

    // ⬇️ Autoload semua route plugin dari folder /routes
    const routeFiles = fs.readdirSync(path.join(__dirname, 'routes'))
        .filter(f => f.endsWith('.js'));

    for (const file of routeFiles) {
        const plugin = require(path.join(__dirname, 'routes', file));
        await server.register(plugin);
    }

    await server.start();
    console.log('🚀 Server:', server.info.uri);
};

process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
});

init();
