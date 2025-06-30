const midtransClient = require('midtrans-client');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');

module.exports = {
    name: 'upgrade-plan',
    version: '1.0.0',
    register: async function (server, options) {

        // === GET /payment/snap-token ===
        server.route({
            method: 'GET',
            path: '/payment/snap-token',
            options: {
                tags: ['api', 'Payment'],
                description: 'Generate Midtrans Snap token for plan upgrade',
                pre: [verifyToken, requireRole('student')],
            },
            handler: async (request, h) => {
                const user = request.auth.credentials;

                const snap = new midtransClient.Snap({
                    isProduction: false, // Sandbox mode
                    serverKey: process.env.MIDTRANS_SERVER_KEY,
                });

                const orderId = `UPGRADE-${user.id}-${Date.now()}`;
                const transactionDetails = {
                    transaction_details: {
                        order_id: orderId,
                        gross_amount: 50000, // Amount in IDR
                    },
                    customer_details: {
                        first_name: user.full_name || 'User',
                        email: user.email,
                    },
                    callbacks: {
                        finish: `${process.env.FRONTEND_BASE_URL}#/payment-success`,
                    }
                };

                try {
                    const response = await snap.createTransaction(transactionDetails);

                    // Simpan log transaksi
                    await supabase.from('payment_logs').insert({
                        user_id: user.id,
                        order_id: orderId,
                        amount: 50000,
                        status: 'pending',
                    });

                    return h.response({
                        token: response.token,
                        redirect_url: response.redirect_url,
                    }).code(200);
                } catch (err) {
                    console.error('Midtrans error:', err);
                    return h.response({ message: 'Gagal membuat transaksi' }).code(500);
                }
            },
        });

        // === POST /payment/upgrade (Midtrans Webhook) ===
        server.route({
            method: 'POST',
            path: '/payment/upgrade',
            options: {
                auth: false,
                tags: ['api', 'Payment'],
                description: 'Webhook dari Midtrans untuk update plan setelah pembayaran',
            },
            handler: async (request, h) => {
                const body = request.payload;
                const orderId = body.order_id;
                const status = body.transaction_status;

                if (!orderId) return h.response({ message: 'order_id tidak valid' }).code(400);

                // Ambil userId dari format order_id: UPGRADE-<user_id>-<timestamp>
                const userId = orderId.split('-')[1];

                // Jika pembayaran sukses, ubah plan user
                if (['settlement', 'capture'].includes(status)) {
                    await supabase.from('users')
                        .update({ plan: 'premium' })
                        .eq('id', userId);
                }

                // Simpan status terbaru ke log
                await supabase.from('payment_logs')
                    .update({ status })
                    .eq('order_id', orderId);

                return h.response({ message: 'Webhook diterima' }).code(200);
            }
        });

        // === Optional Redirect Routes (untuk frontend Snap) ===
        server.route([
            {
                method: 'GET',
                path: '/payment/finish',
                options: { auth: false },
                handler: (req, h) => h.response('✅ Pembayaran berhasil.').code(200)
            },
            {
                method: 'GET',
                path: '/payment/unfinish',
                options: { auth: false },
                handler: (req, h) => h.response('⚠️ Pembayaran belum selesai.').code(200)
            },
            {
                method: 'GET',
                path: '/payment/error',
                options: { auth: false },
                handler: (req, h) => h.response('❌ Terjadi kesalahan saat pembayaran.').code(500)
            }
        ]);
    }
};
