const Joi = require('joi');
const db = require('../db');
const Boom = require('@hapi/boom');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'class-management',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // === POST /teacher/class ===
            {
                method: 'POST',
                path: '/teacher/classes',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Buat kelas baru berdasarkan profil teacher',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            name: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const teacherId = req.auth.credentials.id;
                    const { name } = req.payload;

                    // Ambil data profil teacher
                    const { data: profile, error: profileError } = await db
                        .from('teacher_profiles')
                        .select('program_studi, perguruan_tinggi')
                        .eq('user_id', teacherId)
                        .maybeSingle();

                    if (profileError || !profile) {
                        return Boom.badRequest('Profil teacher tidak ditemukan atau belum lengkap');
                    }

                    const { program_studi, perguruan_tinggi } = profile;

                    const { error } = await db.from('classes').insert({
                        name,
                        teacher_id: teacherId,
                        program_studi,
                        perguruan_tinggi,
                    });

                    if (error) {
                        //console.error(error);
                        return Boom.internal('Gagal membuat kelas');
                    }

                    return h.response({
                        message: 'Kelas berhasil dibuat',
                    }).code(201);
                },
            },

            // 🔍 GET /teacher/classes
            {
                method: 'GET',
                path: '/teacher/classes',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Ambil semua kelas milik teacher',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const teacherId = req.auth.credentials.id;
                    const { data, error } = await db
                        .from('classes')
                        .select('*')
                        .eq('teacher_id', teacherId);

                    if (error) {
                        //console.error(error);
                        return Boom.internal('Gagal mengambil data kelas');
                    }

                    return data;
                },
            },

            // 🔍 GET /teacher/class/{id}/students
            {
                method: 'GET',
                path: '/teacher/class/{id}/students',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Ambil semua siswa yang tergabung dalam kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const classId = req.params.id;
                    const { data, error } = await db
                        .from('student_profiles')
                        .select('id, full_name, nim, program_studi, jurusan, perguruan_tinggi')
                        .eq('class_id', classId);

                    if (error) return Boom.internal('Gagal mengambil anggota kelas');
                    return data;
                },
            },

            // ❌ DELETE /teacher/class/{id}/students/{student_id}
            {
                method: 'DELETE',
                path: '/teacher/class/{id}/students/{student_id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Keluarkan siswa dari kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const { student_id } = req.params;
                    const { error } = await db
                        .from('student_profiles')
                        .update({ class_id: null })
                        .eq('id', student_id);

                    if (error) return Boom.internal('Gagal menghapus siswa dari kelas');
                    return { message: 'Siswa berhasil dikeluarkan dari kelas' };
                },
            },

            // ✏️ PUT /teacher/class/{id}
            {
                method: 'PUT',
                path: '/teacher/class/{id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Edit nama kelas',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            name: Joi.string().optional(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { id } = req.params;
                    const { error } = await db.from('classes').update(req.payload).eq('id', id);
                    if (error) return Boom.internal('Gagal mengupdate kelas');
                    return { message: 'Kelas berhasil diperbarui' };
                },
            },

            // ❌ DELETE /teacher/class/{id}
            {
                method: 'DELETE',
                path: '/teacher/class/{id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Hapus kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const { id } = req.params;
                    const { error } = await db.from('classes').delete().eq('id', id);
                    if (error) return Boom.internal('Gagal menghapus kelas');
                    return { message: 'Kelas berhasil dihapus' };
                },
            },

            // 🔍 GET /admin/classes - List all classes with pagination and search
            {
                method: 'GET',
                path: '/admin/classes',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Ambil semua kelas dengan pagination dan search',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            page: Joi.number().min(1).default(1),
                            limit: Joi.number().min(1).max(100).default(20),
                            search: Joi.string().allow('').optional(),
                            teacher_id: Joi.string().uuid().optional()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { page, limit, search, teacher_id } = req.query;
                    const offset = (page - 1) * limit;

                    try {
                        // 1. Base query
                        let query = db.from('classes')
                            .select(`
                                id,
                                class_code,
                                name,
                                program_studi,
                                perguruan_tinggi,
                                created_at,
                                teacher_id,
                                teacher:users!teacher_id (
                                    id,
                                    full_name,
                                    email
                                )
                            `);

                        // Apply filters
                        if (teacher_id) {
                            query = query.eq('teacher_id', teacher_id);
                        }

                        if (search) {
                            query = query.or(`name.ilike.%${search}%,program_studi.ilike.%${search}%,perguruan_tinggi.ilike.%${search}%`);
                        }

                        // 2. Get total count
                        const { count, error: countError } = await query
                            .select('*', { count: 'exact', head: true });

                        if (countError) throw countError;

                        const total = count || 0;
                        const totalPages = Math.ceil(total / limit);

                        // 3. Get paginated data
                        const { data: classes, error: dataError } = await query
                            .order('created_at', { ascending: false })
                            .range(offset, offset + limit - 1);

                        if (dataError) throw dataError;

                        // 4. Get student counts for each class
                        const classIds = classes.map(c => c.id);
                        const { data: studentCounts, error: countStudentError } = await db
                            .from('student_profiles')
                            .select('class_id')
                            .in('class_id', classIds);

                        if (countStudentError) throw countStudentError;

                        // Count students per class
                        const studentCountMap = {};
                        if (studentCounts) {
                            studentCounts.forEach(sc => {
                                studentCountMap[sc.class_id] = (studentCountMap[sc.class_id] || 0) + 1;
                            });
                        }

                        // Add student count to each class
                        const finalClasses = classes.map(c => ({
                            ...c,
                            student_count: studentCountMap[c.id] || 0
                        }));

                        return {
                            classes: finalClasses,
                            pagination: {
                                page,
                                limit,
                                total,
                                totalPages
                            }
                        };
                    } catch (error) {
                        //console.error('Error fetching admin classes:', error);
                        return Boom.internal('Gagal mengambil data kelas');
                    }
                }
            },

            // 🔍 GET /admin/teachers - List all teachers for dropdowns
            {
                method: 'GET',
                path: '/admin/teachers',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Ambil semua teacher untuk dropdown',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            page: Joi.number().min(1).default(1),
                            limit: Joi.number().min(1).max(500).default(100),
                            search: Joi.string().allow('').optional()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { page, limit, search } = req.query;
                    const offset = (page - 1) * limit;

                    try {
                        let query = db
                            .from('users')
                            .select('id, full_name, email')
                            .eq('role', 'teacher');

                        if (search) {
                            query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
                        }

                        // Get total count
                        const { count, error: countError } = await query
                            .select('*', { count: 'exact', head: true });

                        if (countError) throw countError;

                        const total = count || 0;
                        const totalPages = Math.ceil(total / limit);

                        // Get paginated data
                        const { data: teachers, error } = await query
                            .order('full_name')
                            .range(offset, offset + limit - 1);

                        if (error) throw error;

                        return {
                            teachers: teachers || [],
                            pagination: {
                                page,
                                limit,
                                total,
                                totalPages
                            }
                        };
                    } catch (error) {
                        //console.error('Error fetching teachers:', error);
                        return Boom.internal('Gagal mengambil data teacher');
                    }
                }
            },

            // 📝 POST /admin/class - Create class for any teacher
            {
                method: 'POST',
                path: '/admin/class',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Buat kelas untuk teacher tertentu',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        payload: Joi.object({
                            name: Joi.string().min(2).max(100).required(),
                            teacher_id: Joi.string().uuid().required(),
                            program_studi: Joi.string().max(100).allow('').optional(),
                            perguruan_tinggi: Joi.string().max(100).allow('').optional()
                        })
                    }
                },
                handler: async (req, h) => {
                    const adminId = req.auth.credentials.id;
                    const { name, teacher_id, program_studi, perguruan_tinggi } = req.payload;

                    try {
                        // Verify teacher exists
                        const { data: teacher, error: teacherError } = await db
                            .from('users')
                            .select('id, full_name')
                            .eq('id', teacher_id)
                            .eq('role', 'teacher')
                            .single();

                        if (teacherError || !teacher) {
                            return Boom.badRequest('Teacher tidak ditemukan atau role tidak valid');
                        }

                        // Check duplicate name for this teacher
                        const { data: existingClass, error: checkError } = await db
                            .from('classes')
                            .select('id')
                            .eq('name', name.trim())
                            .eq('teacher_id', teacher_id)
                            .maybeSingle();

                        if (checkError) throw checkError;
                        if (existingClass) {
                            return Boom.badRequest('Nama kelas sudah digunakan oleh teacher ini');
                        }

                        // Get teacher profile if needed
                        let finalProgramStudi = program_studi?.trim() || '';
                        let finalPerguruanTinggi = perguruan_tinggi?.trim() || '';

                        if (!finalProgramStudi || !finalPerguruanTinggi) {
                            const { data: teacherProfile } = await db
                                .from('teacher_profiles')
                                .select('program_studi, perguruan_tinggi')
                                .eq('user_id', teacher_id)
                                .maybeSingle();

                            if (teacherProfile) {
                                finalProgramStudi = finalProgramStudi || teacherProfile.program_studi || '';
                                finalPerguruanTinggi = finalPerguruanTinggi || teacherProfile.perguruan_tinggi || '';
                            }
                        }

                        // Ensure program_studi is not empty since it's required
                        if (!finalProgramStudi) {
                            return Boom.badRequest('Program studi diperlukan. Pastikan teacher memiliki profile lengkap atau isi manual.');
                        }

                        // Create class
                        const { data: newClass, error: insertError } = await db
                            .from('classes')
                            .insert({
                                name: name.trim(),
                                teacher_id,
                                program_studi: finalProgramStudi,
                                perguruan_tinggi: finalPerguruanTinggi
                            })
                            .select()
                            .single();

                        if (insertError) throw insertError;

                        return h.response({
                            message: `Kelas "${name.trim()}" berhasil dibuat untuk ${teacher.full_name}`,
                            data: newClass
                        }).code(201);

                    } catch (error) {
                        //console.error('Error creating admin class:', error);
                        return Boom.internal('Gagal membuat kelas');
                    }
                }
            },

            // ✏️ PUT /admin/class/{id} - Update class details (NO TEACHER_ID)
            {
                method: 'PUT',
                path: '/admin/class/{id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Update detail kelas (nama, program studi, perguruan tinggi)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        }),
                        payload: Joi.object({
                            name: Joi.string().min(2).max(100).optional(),
                            program_studi: Joi.string().max(100).allow('').optional(),
                            perguruan_tinggi: Joi.string().max(100).allow('').optional()
                            // TIDAK ADA teacher_id - gunakan endpoint transfer untuk mengubah teacher
                        }).min(1)
                    }
                },
                handler: async (req, h) => {
                    const adminId = req.auth.credentials.id;
                    const { id } = req.params;
                    const updateData = req.payload;

                    try {
                        // Check if class exists
                        const { data: existingClass, error: classError } = await db
                            .from('classes')
                            .select('*')
                            .eq('id', id)
                            .single();

                        if (classError || !existingClass) {
                            return Boom.notFound('Kelas tidak ditemukan');
                        }

                        // If name is being changed, check for duplicates with same teacher
                        if (updateData.name && updateData.name.trim() !== existingClass.name) {
                            const { data: duplicateClass } = await db
                                .from('classes')
                                .select('id')
                                .eq('name', updateData.name.trim())
                                .eq('teacher_id', existingClass.teacher_id) // Check for same teacher
                                .neq('id', id)
                                .maybeSingle();

                            if (duplicateClass) {
                                return Boom.badRequest('Nama kelas sudah digunakan oleh teacher yang sama');
                            }
                        }

                        // Prepare update data
                        const finalUpdateData = {};

                        if (updateData.name) {
                            finalUpdateData.name = updateData.name.trim();
                        }

                        // Only update program_studi if it's provided and not empty
                        if (updateData.program_studi && updateData.program_studi.trim()) {
                            finalUpdateData.program_studi = updateData.program_studi.trim();
                        }

                        // Only update perguruan_tinggi if it's provided
                        if (updateData.perguruan_tinggi !== undefined) {
                            finalUpdateData.perguruan_tinggi = updateData.perguruan_tinggi?.trim() || '';
                        }

                        // Ensure we have something to update
                        if (Object.keys(finalUpdateData).length === 0) {
                            return Boom.badRequest('Tidak ada data yang valid untuk diupdate');
                        }

                        // Update class
                        const { data: updatedClass, error: updateError } = await db
                            .from('classes')
                            .update(finalUpdateData)
                            .eq('id', id)
                            .select()
                            .single();

                        if (updateError) throw updateError;

                        return {
                            message: 'Detail kelas berhasil diperbarui',
                            data: updatedClass
                        };

                    } catch (error) {
                        //console.error('Error updating admin class:', error);
                        return Boom.internal('Gagal mengupdate kelas');
                    }
                }
            },

            // 🔄 PATCH /admin/class/{id}/transfer - Transfer class ownership
            {
                method: 'PATCH',
                path: '/admin/class/{id}/transfer',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Transfer kepemilikan kelas ke teacher lain',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        }),
                        payload: Joi.object({
                            teacher_id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const adminId = req.auth.credentials.id;
                    const { id } = req.params;
                    const { teacher_id } = req.payload;

                    try {
                        // Check if class exists
                        const { data: existingClass, error: classError } = await db
                            .from('classes')
                            .select('*')
                            .eq('id', id)
                            .single();

                        if (classError || !existingClass) {
                            return Boom.notFound('Kelas tidak ditemukan');
                        }

                        // Check if same teacher
                        if (existingClass.teacher_id === teacher_id) {
                            return Boom.badRequest('Kelas sudah dimiliki oleh teacher ini');
                        }

                        // Verify new teacher
                        const { data: newTeacher, error: teacherError } = await db
                            .from('users')
                            .select('id, full_name, email')
                            .eq('id', teacher_id)
                            .eq('role', 'teacher')
                            .single();

                        if (teacherError || !newTeacher) {
                            return Boom.badRequest('Teacher tujuan tidak ditemukan atau role tidak valid');
                        }

                        // Get old teacher info
                        const { data: oldTeacher } = await db
                            .from('users')
                            .select('full_name, email')
                            .eq('id', existingClass.teacher_id)
                            .single();

                        // Check if class name conflicts with new teacher's existing classes
                        const { data: conflictClass } = await db
                            .from('classes')
                            .select('id')
                            .eq('name', existingClass.name)
                            .eq('teacher_id', teacher_id)
                            .maybeSingle();

                        if (conflictClass) {
                            return Boom.badRequest(`Teacher ${newTeacher.full_name} sudah memiliki kelas dengan nama "${existingClass.name}"`);
                        }

                        // Transfer ownership
                        const { data: updatedClass, error: transferError } = await db
                            .from('classes')
                            .update({
                                teacher_id
                            })
                            .eq('id', id)
                            .select()
                            .single();

                        if (transferError) throw transferError;

                        return {
                            message: `Kelas "${existingClass.name}" berhasil ditransfer dari ${oldTeacher?.full_name || 'N/A'} ke ${newTeacher.full_name}`,
                            data: {
                                class: updatedClass,
                                from_teacher: oldTeacher,
                                to_teacher: newTeacher,
                                transferred_at: new Date()
                            }
                        };

                    } catch (error) {
                        //console.error('Error transferring class:', error);
                        return Boom.internal('Gagal mentransfer kelas');
                    }
                }
            },

            // ❌ DELETE /admin/class/{id} - Delete any class
            {
                method: 'DELETE',
                path: '/admin/class/{id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Hapus kelas manapun',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { id } = req.params;

                    try {
                        // Check if class exists
                        const { data: existingClass, error: classError } = await db
                            .from('classes')
                            .select('*')
                            .eq('id', id)
                            .single();

                        if (classError || !existingClass) {
                            return Boom.notFound('Kelas tidak ditemukan');
                        }

                        // Get student count
                        const { count: studentCount, error: countError } = await db
                            .from('student_profiles')
                            .select('*', { count: 'exact', head: true })
                            .eq('class_id', id);

                        if (countError) throw countError;

                        const totalStudents = studentCount || 0;

                        // Remove students from class
                        if (totalStudents > 0) {
                            const { error: removeStudentsError } = await db
                                .from('student_profiles')
                                .update({ class_id: null })
                                .eq('class_id', id);

                            if (removeStudentsError) throw removeStudentsError;
                        }

                        // Delete class
                        const { error: deleteError } = await db
                            .from('classes')
                            .delete()
                            .eq('id', id);

                        if (deleteError) throw deleteError;

                        return {
                            message: `Kelas "${existingClass.name}" berhasil dihapus${totalStudents > 0 ? ` dan ${totalStudents} siswa telah dikeluarkan` : ''}`,
                            data: {
                                deleted_class: existingClass,
                                removed_students: totalStudents
                            }
                        };

                    } catch (error) {
                        //console.error('Error deleting admin class:', error);
                        return Boom.internal('Gagal menghapus kelas');
                    }
                }
            },

            // 🔍 GET /admin/class/{id}/students - Get students in any class
            {
                method: 'GET',
                path: '/admin/class/{id}/students',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Ambil siswa dari kelas manapun',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const classId = req.params.id;

                    try {
                        // Verify class exists
                        const { data: classData, error: classError } = await db
                            .from('classes')
                            .select('id, name')
                            .eq('id', classId)
                            .single();

                        if (classError || !classData) {
                            return Boom.notFound('Kelas tidak ditemukan');
                        }

                        // Get students with user email
                        const { data: students, error } = await db
                            .from('student_profiles')
                            .select(`
                                *,
                                users:user_id (
                                    email
                                )
                            `)
                            .eq('class_id', classId)
                            .order('full_name');

                        if (error) throw error;

                        // Flatten the response
                        const formattedStudents = students?.map(student => ({
                            ...student,
                            email: student.users?.email || null
                        })) || [];

                        return formattedStudents;

                    } catch (error) {
                        //console.error('Error fetching admin class students:', error);
                        return Boom.internal('Gagal mengambil data siswa');
                    }
                }
            },

            // ❌ DELETE /admin/class/{id}/students/{student_id} - Remove student from any class
            {
                method: 'DELETE',
                path: '/admin/class/{id}/students/{student_id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Admin - Keluarkan siswa dari kelas manapun',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                            student_id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { id: classId, student_id } = req.params;

                    try {
                        // Verify class exists
                        const { data: classData, error: classError } = await db
                            .from('classes')
                            .select('id, name')
                            .eq('id', classId)
                            .single();

                        if (classError || !classData) {
                            return Boom.notFound('Kelas tidak ditemukan');
                        }

                        // Verify student exists and is in this class
                        const { data: student, error: studentError } = await db
                            .from('student_profiles')
                            .select('id, full_name, class_id')
                            .eq('id', student_id)
                            .single();

                        if (studentError || !student) {
                            return Boom.notFound('Siswa tidak ditemukan');
                        }

                        if (student.class_id !== classId) {
                            return Boom.badRequest('Siswa tidak terdaftar di kelas ini');
                        }

                        // Remove student from class
                        const { error: updateError } = await db
                            .from('student_profiles')
                            .update({ class_id: null })
                            .eq('id', student_id);

                        if (updateError) throw updateError;

                        return {
                            message: `${student.full_name} berhasil dikeluarkan dari kelas ${classData.name}`,
                            data: {
                                student_id,
                                student_name: student.full_name,
                                class_id: classId,
                                class_name: classData.name
                            }
                        };

                    } catch (error) {
                        //console.error('Error removing student from admin class:', error);
                        return Boom.internal('Gagal mengeluarkan siswa dari kelas');
                    }
                }
            },
        ]);
    },
};