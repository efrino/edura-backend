const db = require('../db');
const Boom = require('@hapi/boom');
const Joi = require('joi');
module.exports = {
    name: 'public-enum',
    version: '1.0.0',
    register: async function (server, options) {
        // === GET /enums ===
        server.route({
            method: 'GET',
            path: '/enums',
            options: {
                tags: ['api'],
                description: 'Ambil enum program_studi dan perguruan_tinggi',
            },
            handler: async (request, h) => {
                const programStudi = [
                    'Teknik Informatika',
                    'Teknik Listrik',
                    'Teknik Elektronika',
                    'Teknik Mesin',
                    'Administrasi Bisnis',
                    'Akuntansi',
                ];
                const perguruanTinggi = [
                    'Politeknik Negeri Semarang',
                    'Universitas Diponegoro',
                    'Universitas Semarang',
                    'Universitas Dian Nuswantoro',
                    'Universitas Muhammadiyah Semarang',
                ];
                return { program_studi: programStudi, perguruan_tinggi: perguruanTinggi };
            },
        });

        // === GET /public/class-code-info?code=ABC123 ===
        server.route({
            method: 'GET',
            path: '/public/class-code-info',
            options: {
                tags: ['api'],
                description: 'Cek validitas kode kelas dan kembalikan info program studi & perguruan tinggi',
                validate: {
                    query: Joi.object({
                        code: Joi.string().trim().required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const { code } = request.query;
                console.log(`🔍 Mencari info kelas untuk kode: ${code}`);
                const { data, error } = await db
                    .from('classes')
                    .select('program_studi, perguruan_tinggi, teacher_id')
                    .eq('class_code', code)
                    .maybeSingle(); // ✅ Lebih aman


                if (error || !data) {
                    return Boom.notFound('Kode kelas tidak ditemukan');
                }

                return {
                    program_studi: data.program_studi,
                    perguruan_tinggi: data.perguruan_tinggi,
                    teacher_id: data.teacher_id,
                };
            },
        });
    },
}