// require('dotenv').config();
// const Hapi = require('@hapi/hapi');
// const Inert = require('@hapi/inert');
// const Vision = require('@hapi/vision');
// const HapiSwagger = require('hapi-swagger');
// const fs = require('fs');
// const path = require('path');

// const { verifyToken } = require('./utils/middleware');
// const { logActivity } = require('./utils/activity-logger');
// const { loadActiveGeminiKey } = require('./utils/geminiClient'); // ⬅️ tambahkan ini

// async function createServer() {
//     const server = Hapi.server({
//         port: process.env.PORT || 10000,
//         host: '0.0.0.0',
//         routes: {
//             cors: {
//                 origin: ['*'],
//             },
//         },
//     });

//     // 📘 Swagger
//     await server.register([
//         Inert,
//         Vision,
//         {
//             plugin: HapiSwagger,
//             options: {
//                 info: {
//                     title: '📘 LMS API',
//                     version: '1.0.0',
//                 },
//                 documentationPath: '/',
//                 grouping: 'tags',
//             },
//         },
//     ]);

//     // 🔐 Custom JWT Auth Scheme
//     server.auth.scheme('custom-jwt', () => ({
//         authenticate: async (request, h) => {
//             await verifyToken(request, h);
//             const user = request.auth?.credentials || {};
//             return h.authenticated({ credentials: user });
//         },
//     }));

//     server.auth.strategy('jwt', 'custom-jwt');
//     server.auth.default('jwt');

//     // 🔗 Inject logger
//     server.app.logActivity = logActivity;

//     // 📊 Global logging (except Swagger)
//     server.ext('onPreHandler', async (request, h) => {
//         if (request.path.startsWith('/swagger') || request.path === '/') return h.continue;

//         const user_id = request.auth?.credentials?.id || null;
//         const role = request.auth?.credentials?.role || 'public';

//         const detail = {
//             query: request.query,
//             payload: request.payload,
//         };

//         await server.app.logActivity({
//             user_id,
//             role,
//             action: `${request.method.toUpperCase()} ${request.path}`,
//             detail,
//         });

//         return h.continue;
//     });

//     // 🔄 Load Gemini API Key aktif dari Supabase
//     await loadActiveGeminiKey(); // ⬅️ Tambahkan ini sebelum route berjalan

//     // 📁 Auto-load routes
//     const routesDir = path.join(__dirname, 'routes');
//     const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

//     for (const file of routeFiles) {
//         const routePlugin = require(path.join(routesDir, file));
//         await server.register(routePlugin);
//     }

//     return server;
// }

// async function startServer() {
//     try {
//         const server = await createServer();
//         await server.start();
//         console.log(`🚀 Server running at: ${server.info.uri}`);
//     } catch (err) {
//         console.error('🔥 Server startup error:', err);
//         process.exit(1);
//     }
// }

// process.on('unhandledRejection', (err) => {
//     console.error('🔥 Unhandled Rejection:', err);
//     process.exit(1);
// });

// startServer();
require('dotenv').config();
const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Vision = require('@hapi/vision');
const HapiSwagger = require('hapi-swagger');
const fs = require('fs');
const path = require('path');

const { verifyToken } = require('./utils/middleware');
const { logActivity } = require('./utils/activity-logger');
const { loadActiveGeminiKey } = require('./utils/geminiClient');

async function createServer() {
    const server = Hapi.server({
        port: process.env.PORT || 10000,
        host: '0.0.0.0',
        routes: {
            cors: {
                origin: ['http://localhost:5173', 'http://localhost:5174','https://edura.web.id', 'https://edura-frontend.vercel.app','https://efrino.web.id','https://tc1c65ps-5174.asse.devtunnels.ms'],
            },
        },
    });

    // 📘 Swagger (tidak ada perubahan)
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

    // 🔐 Custom JWT Auth Scheme (tidak ada perubahan)
    server.auth.scheme('custom-jwt', () => ({
        authenticate: async (request, h) => {
            await verifyToken(request, h);
            const user = request.auth?.credentials || {};
            return h.authenticated({ credentials: user });
        },
    }));
    server.auth.strategy('jwt', 'custom-jwt');
    server.auth.default('jwt');

    // 🔗 Inject logger (tidak ada perubahan)
    server.app.logActivity = logActivity;

    // 📊 Global logging (tidak ada perubahan)
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

    // 🛡️ SECURITY HEADERS MIDDLEWARE
    // 🚀 TAMBAHKAN BLOK INI UNTUK MENERAPKAN KEAMANAN
    server.ext('onPreResponse', (request, h) => {
        const response = request.response;

        // Jangan modifikasi respons error atau yang sudah dialihkan
        if (response.isBoom || !response.header) {
            return h.continue;
        }

        // Content-Security-Policy (CSP) - Paling Penting
        const csp = [
            "default-src 'self'",
            // Izinkan skrip dari domain sendiri, inline, dan CDN yang Anda gunakan
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
            // Izinkan style dari domain sendiri, inline, dan sumber font/icon
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
            // Izinkan font dari Google dan FontAwesome
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
            // Izinkan gambar dari domain sendiri dan skema data:
            "img-src 'self' data:",
             // Izinkan koneksi (fetch/XHR) ke domain sendiri dan API Supabase
            "connect-src 'self' *.supabase.co",
            // Jangan izinkan halaman di-embed dalam iframe
            "frame-ancestors 'none'",
            // Hanya izinkan form di-submit ke domain sendiri
            "form-action 'self'",
            // Jangan izinkan plugin seperti Flash
            "object-src 'none'",
            "base-uri 'self'",
        ].join('; ');
        response.header('Content-Security-Policy', csp);

        // 2. Strict-Transport-Security (HSTS) - Memaksa HTTPS
        response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

        // 3. X-Frame-Options - Mencegah clickjacking
        response.header('X-Frame-Options', 'DENY');

        // 4. X-Content-Type-Options - Mencegah MIME-sniffing
        response.header('X-Content-Type-Options', 'nosniff');

        // 5. Referrer-Policy - Mengontrol informasi referrer
        response.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // 6. Permissions-Policy - Menonaktifkan fitur browser sensitif
        response.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        return h.continue;
    });

    // 🔄 Load Gemini API Key aktif dari Supabase
    await loadActiveGeminiKey();

    // 📁 Auto-load routes (tidak ada perubahan)
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