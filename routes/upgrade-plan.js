const midtransClient = require('midtrans-client');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');

module.exports = {
    name: 'upgrade-plan',
    version: '1.0.0',
    register: async function (server) {

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
                    isProduction: false,
                    serverKey: process.env.MIDTRANS_SERVER_KEY,
                });

                const orderId = `UPG-${user.id}-${Date.now().toString(36)}`;
                const productName = 'Edura Premium - 1 Bulan';
                const price = 50000;

                const transactionDetails = {
                    transaction_details: {
                        order_id: orderId,
                        gross_amount: price,
                    },
                    item_details: [
                        {
                            id: 'edura-premium',
                            name: productName,
                            quantity: 1,
                            price,
                        },
                    ],
                    customer_details: {
                        first_name: user.full_name || 'User',
                        email: user.email,
                    },
                    callbacks: {
                        finish: `${process.env.FRONTEND_BASE_URL}#/payment-success`,
                    },
                };

                try {
                    const response = await snap.createTransaction(transactionDetails);

                    await supabase.from('payment_logs').insert({
                        user_id: user.id,
                        order_id: orderId,
                        full_name: user.full_name,
                        email: user.email,
                        product: productName,
                        duration: '1 bulan',
                        amount: price,
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

        // === POST /payment/upgrade ===
        server.route({
            method: 'POST',
            path: '/payment/upgrade',
            options: {
                auth: false,
                tags: ['api', 'Payment'],
                description: 'Webhook dari Midtrans untuk update plan',
            },
            handler: async (request, h) => {
                const body = request.payload;
                const orderId = body.order_id;
                const status = body.transaction_status;

                if (!orderId) return h.response({ message: 'order_id tidak valid' }).code(400);

                const { data: log, error: logErr } = await supabase
                    .from('payment_logs')
                    .select('user_id')
                    .eq('order_id', orderId)
                    .single();

                if (logErr || !log) {
                    console.error('Log tidak ditemukan untuk order:', orderId);
                    return h.response().code(400);
                }

                const userId = log.user_id;

                // UPGRADE PLAN jika status sukses (settlement atau capture)
                if (['settlement', 'capture'].includes(status)) {
                    const expiredAt = new Date();
                    expiredAt.setMonth(expiredAt.getMonth() + 1); // +1 bulan

                    const { error: updateErr } = await supabase
                        .from('users')
                        .update({
                            plan: 'premium',
                            plan_expires_at: expiredAt.toISOString(),
                        })
                        .eq('id', userId);

                    if (updateErr) {
                        console.error('❌ Gagal update plan user:', updateErr);
                    } else {
                        console.log('✅ Berhasil update plan ke premium untuk user:', userId);
                    }
                }

                // Simpan status terbaru
                await supabase
                    .from('payment_logs')
                    .update({ status })
                    .eq('order_id', orderId);

                return h.response({ message: 'Webhook diterima' }).code(200);
            }
        });
        // profile
        server.route({
            method: 'GET',
            path: '/me',
            options: {
                tags: ['api', 'User'],
                description: 'Get current logged-in user',
                pre: [verifyToken],
            },
            handler: async (request, h) => {
                const user = request.auth.credentials;
                return h.response(user).code(200);
            }
        });

    },
};
