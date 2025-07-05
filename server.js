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

    // 📘 Swagger
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

    // 🔐 Custom JWT Auth Scheme
    server.auth.scheme('custom-jwt', () => ({
        authenticate: async (request, h) => {
            await verifyToken(request, h);
            // Jika tidak isAuthenticated, beri dummy credentials agar tidak error
            const user = request.auth?.credentials || {};
            return h.authenticated({ credentials: user });
        },
    }));

    server.auth.strategy('jwt', 'custom-jwt');
    server.auth.default('jwt'); // All routes use JWT (except PUBLIC_ROUTES)

    // 🔗 Inject logger
    server.app.logActivity = logActivity;

    // 📊 Global logging (except Swagger)
    server.ext('onPreHandler', async (request, h) => {
        if (request.path.startsWith('/swagger') || request.path === '/') return h.continue;

        const user_id = request.auth?.credentials?.id || null;
        const role = request.auth?.credentials?.role || 'public';

        const detail = {
            query: request.query,
            payload: request.payload,
        };

        await server.app.logActivity({
            user_id,
            role,
            action: `${request.method.toUpperCase()} ${request.path}`,
            detail,
        });

        return h.continue;
    });

    // 🔄 Auto-load routes from /routes
    const routesDir = path.join(__dirname, 'routes');
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

    for (const file of routeFiles) {
        const routePlugin = require(path.join(routesDir, file));
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
