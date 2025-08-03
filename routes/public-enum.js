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
                description: 'Ambil enum program_studi dan perguruan_tinggi dari database',
            },
            handler: async (request, h) => {
                try {
                    // Query untuk mendapatkan enum values dari PostgreSQL
                    const { data: programStudiData, error: programStudiError } = await db
                        .rpc('get_enum_values', { enum_name: 'program_studi_enum' });

                    const { data: perguruanTinggiData, error: perguruanTinggiError } = await db
                        .rpc('get_enum_values', { enum_name: 'perguruan_tinggi_enum' });

                    if (programStudiError || perguruanTinggiError) {
                        //console.error('Error fetching enums:', { programStudiError, perguruanTinggiError });
                        throw Boom.internal('Gagal mengambil data enum');
                    }

                    return {
                        program_studi: programStudiData || [],
                        perguruan_tinggi: perguruanTinggiData || []
                    };
                } catch (error) {
                    //console.error('Error in /enums handler:', error);

                    // Fallback ke data hardcoded jika ada masalah dengan database
                    const fallbackProgramStudi = [
                        'Teknik Informatika',
                        'Teknik Listrik',
                        'Teknik Elektronika',
                        'Teknik Mesin',
                        'Administrasi Bisnis',
                        'Akuntansi',
                        'Arsitektur',
                        'Periklanan',
                        'Manajemen',
                        'Teknik Industri',
                        'Pendidikan Biologi',
                        'Pendidikan Matematika',
                        'Kehutanan',
                        'Farmasi',
                        'Demografi',
                        'Geografi',
                        'Keperawatan',
                        'Gizi'
                    ];

                    const fallbackPerguruanTinggi = [
                        'Politeknik Negeri Semarang',
                        'Politeknik Negeri Batam',
                        'Politeknik Negeri Madiun',
                        'Politeknik Negeri Pontianak',
                        'Politeknik Negeri Ketapang',
                        'Politeknik Negeri Sambas',
                        'Universitas Diponegoro',
                        'Universitas Negeri Semarang',
                        'Universitas Dian Nuswantoro',
                        'Politeknik Media Kreatif',
                        'Universitas Muhammadiyah Semarang',
                        'Universitas PGRI Semarang',
                        'Universitas Islam Negeri Semarang',
                        'Universitas Sultan Ageng Tirtayasa',
                        'Universitas Gadjah Mada',
                        'Universitas Negeri Sebelas Maret',
                        'Universitas Negeri Yogyakarta',
                        'Bina Sarana Informatika'
                    ];

                    //console.log('Using fallback enum data');
                    return {
                        program_studi: fallbackProgramStudi,
                        perguruan_tinggi: fallbackPerguruanTinggi
                    };
                }
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
                //console.log(`🔍 Mencari info kelas untuk kode: ${code}`);

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