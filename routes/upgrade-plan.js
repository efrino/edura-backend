// routes/upgrade-plan.js
const midtransClient = require('midtrans-client');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');

module.exports = {
    name: 'upgrade-plan',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'POST',
            path: '/upgrade-plan',
            options: {
                tags: ['api', 'Payment'],
                description: 'Upgrade plan from free to premium',
                pre: [verifyToken, requireRole('student')],
            },
            handler: async (request, h) => {
                const user = request.auth.credentials;
                const snap = new midtransClient.Snap({
                    isProduction: false,
                    serverKey: process.env.MIDTRANS_SERVER_KEY,
                });

                const orderId = `UPGRADE-${user.id}-${Date.now()}`;
                const transactionDetails = {
                    transaction_details: {
                        order_id: orderId,
                        gross_amount: 50000,
                    },
                    customer_details: {
                        first_name: user.full_name || 'User',
                        email: user.email,
                    }
                };

                try {
                    const response = await snap.createTransaction(transactionDetails);

                    // Simpan log transaksi
                    await supabase.from('payment_logs').insert({
                        user_id: user.id,
                        order_id: orderId,
                        amount: 50000,
                        status: 'pending'
                    });

                    return h.response({
                        token: response.token,
                        redirect_url: response.redirect_url,
                    }).code(200);
                } catch (err) {
                    console.error('Midtrans error:', err);
                    return h.response({ message: 'Gagal membuat transaksi' }).code(500);
                }
            }
        });

        server.route({
            method: 'POST',
            path: '/webhook/midtrans',
            options: {
                auth: false,
            },
            handler: async (request, h) => {
                const body = request.payload;
                const orderId = body.order_id;
                const status = body.transaction_status;

                if (['settlement', 'capture'].includes(status)) {
                    const userId = orderId.split('-')[1];

                    await supabase.from('users')
                        .update({ plan: 'premium' })
                        .eq('id', userId);
                }

                await supabase.from('payment_logs')
                    .update({ status })
                    .eq('order_id', orderId);

                return h.response().code(200);
            }
        });
    }
};
