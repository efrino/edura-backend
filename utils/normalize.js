function normalizeSubject(subject) {
    return subject
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, '') // hilangkan simbol
        .replace(/\b(contoh|belajar|kursus|course|tentang|dasar|mengenal|pemrograman)\b/g, '') // hilangkan kata umum
        .replace(/\s+/g, ' ') // hapus spasi berlebih
        .trim();
}

module.exports = { normalizeSubject };
