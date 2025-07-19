const midtransClient = require('midtrans-client');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { getEnv } = require('../utils/env');

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

                const serverKey = await getEnv('MIDTRANS_SERVER_KEY');
                const frontendBaseUrl = await getEnv('FRONTEND_BASE_URL');

                const snap = new midtransClient.Snap({
                    isProduction: true,
                    serverKey,
                });


                const orderId = `EPP-${user.id}-${Date.now().toString(36)}`;
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
                        finish: `${frontendBaseUrl}#/payment-success`,
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
                description: 'Webhook dari Midtrans untuk update plan dan log pembayaran',
            },
            handler: async (request, h) => {
                const body = request.payload;
                const orderId = body.order_id;
                const status = body.transaction_status;

                if (!orderId) {
                    return h.response({ message: 'order_id tidak valid' }).code(400);
                }

                const { data: log, error: logErr } = await supabase
                    .from('payment_logs')
                    .select('user_id')
                    .eq('order_id', orderId)
                    .maybeSingle();

                if (logErr || !log) {
                    console.error('❌ Log tidak ditemukan untuk order:', orderId);
                    return h.response().code(200); // tetap 200 agar Midtrans tidak retry terus
                }

                const userId = log.user_id;

                if (['settlement', 'capture'].includes(status)) {
                    // ✅ Update plan premium
                    const expiredAt = new Date();
                    expiredAt.setMonth(expiredAt.getMonth() + 1);

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
                        console.log('✅ Plan premium berhasil diperpanjang untuk user:', userId);

                        // 📩 Kirim email konfirmasi ke user
                        const { data: userInfo, error: userInfoErr } = await supabase
                            .from('users')
                            .select('full_name, email')
                            .eq('id', userId)
                            .maybeSingle();

                        if (userInfo && userInfo.email) {
                            try {
                                await sendPaymentStatusEmail(userInfo.email, {
                                    userName: userInfo.full_name || 'User',
                                    status,
                                    amount: body.gross_amount || 50000,
                                });
                                console.log(`📧 Email pembayaran dikirim ke ${userInfo.email}`);
                            } catch (err) {
                                console.error('❌ Gagal kirim email pembayaran:', err.message);
                            }
                        }
                    }
                }


                // === Simpan data tambahan dari Midtrans
                const updateData = {
                    status: status,
                    transaction_status: status,
                    payment_type: body.payment_type || null,
                    transaction_time: body.transaction_time || null,
                    settlement_time: body.settlement_time || null,
                    bank: body.bank || null,
                    card_type: body.card_type || null,
                    fraud_status: body.fraud_status || null,
                    currency: body.currency || null,
                    masked_card: body.masked_card || null,
                    channel_response_code: body.channel_response_code || null,
                    channel_response_message: body.channel_response_message || null,
                    approval_code: body.approval_code || null,
                };

                await supabase
                    .from('payment_logs')
                    .update(updateData)
                    .eq('order_id', orderId);

                return h.response({ message: 'Webhook diterima' }).code(200);
            },
        });
        // === GET /payment/status?order_id=UPG-xxxx ===
        server.route({
            method: 'GET',
            path: '/payment/status',
            options: {
                auth: false,
                tags: ['api', 'Payment'],
                description: 'Cek status pembayaran berdasarkan order_id',
            },
            handler: async (request, h) => {
                const { order_id } = request.query;

                if (!order_id) {
                    return h.response({ message: 'order_id diperlukan' }).code(400);
                }

                const serverKey = await getEnv('MIDTRANS_SERVER_KEY');
                const encodedKey = Buffer.from(`${serverKey}:`).toString('base64');

                try {
                    const response = await fetch(`https://api.midtrans.com/v2/${order_id}/status`, {
                        headers: {
                            Authorization: `Basic ${encodedKey}`,
                            Accept: 'application/json',
                        },
                    });

                    const data = await response.json();

                    return h.response({
                        order_id: data.order_id,
                        transaction_status: data.transaction_status,
                        payment_type: data.payment_type,
                        gross_amount: data.gross_amount,
                        va_numbers: data.va_numbers || [],
                        transaction_time: data.transaction_time,
                        settlement_time: data.settlement_time || null,
                    }).code(200);

                } catch (err) {
                    console.error('❌ Gagal cek status:', err);
                    return h.response({ message: 'Gagal mendapatkan status transaksi' }).code(500);
                }
            },
        });

        // === GET /me (profile)
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
