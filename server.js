// server.js

require('dotenv').config();
const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Vision = require('@hapi/vision');
const HapiSwagger = require('hapi-swagger');
const fs = require('fs');
const path = require('path');

const { verifyToken } = require('./utils/middleware');
const { logActivity } = require('./utils/activity-logger');

async function createServer() {
    const server = Hapi.server({
        port: process.env.PORT || 10000,
        host: '0.0.0.0',
        routes: {
            cors: {
                origin: ['*'],
            },
        },
    });

    // 📘 Swagger documentation
    await server.register([
        Inert,
        Vision,
        {
            plugin: HapiSwagger,
            options: {
                info: {
                    title: '📘 LMS API',
                    version: '1.0.0',
                },
                documentationPath: '/',
                grouping: 'tags',
            },
        },
    ]);

    // 🔐 Custom JWT auth scheme
    server.auth.scheme('custom-jwt', () => ({
        authenticate: async (request, h) => {
            await verifyToken(request, h);
            return h.authenticated({ credentials: request.auth.credentials });
        },
    }));

    server.auth.strategy('jwt', 'custom-jwt');
    server.auth.default('jwt'); // ✅ All routes use JWT unless opt-out

    // 📝 Inject global logger
    server.app.logActivity = logActivity;

    // 📊 Global request logging
    server.ext('onPreHandler', async (request, h) => {
        if (request.path.startsWith('/swagger') || request.path === '/') return h.continue;

        const { method, path } = request;
        const user_id = request.auth?.credentials?.id || null;
        const role = request.auth?.credentials?.role || 'public';

        const action = `${method.toUpperCase()} ${path}`;
        const detail = {
            query: request.query,
            payload: request.payload,
        };

        await request.server.app.logActivity({ user_id, role, action, detail });
        return h.continue;
    });

    // 🧩 Auto-load routes from ./routes
    const routeFiles = fs
        .readdirSync(path.join(__dirname, 'routes'))
        .filter(file => file.endsWith('.js'));

    for (const file of routeFiles) {
        const routePlugin = require(path.join(__dirname, 'routes', file));
        await server.register(routePlugin);
    }

    return server;
}

async function startServer() {
    try {
        const server = await createServer();
        await server.start();
        console.log(`🚀 Server running at: ${server.info.uri}`);
    } catch (err) {
        console.error('🔥 Server startup error:', err);
        process.exit(1);
    }
}

process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
    process.exit(1);
});

startServer();
