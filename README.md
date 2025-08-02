# 🧠 Edura Backend

Ini adalah **Backend API** untuk platform **Edura**, sebuah sistem pembelajaran berbasis AI yang mendukung pembuatan course otomatis, autentikasi, manajemen pengguna, sistem pembayaran, dan integrasi dengan layanan pihak ketiga seperti Supabase, Midtrans, Google Gemini, dan OpenAI.

---

## 🚀 Fitur Utama

- ⚙️ RESTful API dengan [Hapi.js](https://hapi.dev/)
- 🧠 Integrasi AI: Google Gemini & OpenAI
- 🧾 Manajemen pembayaran via Midtrans
- 📧 Pengiriman email menggunakan Nodemailer
- 🔁 Worker otomatis (cron job)
- 📦 Backup & Logging (termasuk script pengelolaannya)
- 🧪 Validasi menggunakan Joi
- 🧩 Dokumentasi API via hapi-swagger
- 🔐 Autentikasi JWT

---

## 📦 Struktur Folder

```bash
.
├── server.js                # Entry point
├── worker/
│   └── generate-sessions-worker.js
├── scripts/                 # Testing
│   ├── test-backup.js
│   ├── backup-status.js
│   ├── trigger-backup.js
│   ├── cleanup-old-logs.js
│   ├── check-routes.js
│   └── test-database.js
├── utils/                   # Utilitas
├── routes/                  # Route API
```

---

## ⚙️ Instalasi

```bash
git clone https://github.com/efrino/backend-edura.git
cd backend-edura
npm install
```

---

## 🧪 Menjalankan Server

```bash
# Mode development (dengan nodemon)
npm run dev

# Mode production
npm start

# Menjalankan worker generate sesi
npm run jobs
```

---

## 🛠️ Script CLI (Opsional)

- `npm run backup:test` – Uji koneksi backup
- `npm run backup:status` – Cek status backup
- `npm run backup:trigger` – Jalankan backup manual
- `npm run backup:cleanup` – Hapus log backup lama
- `npm run backup:check-routes` – Cek integritas route API
- `npm run backup:db-test` – Uji koneksi ke database

---

## 🔐 Environment Variables

Buat file `.env` atau pastikan environment tersedia dengan konfigurasi berikut:

```env
# URL & Host
BACKEND_BASE_URL=http://localhost:10000
FRONTEND_BASE_URL=http://localhost:5173/

# JWT
JWT_SECRET=...

# Email Config
MAIL_HOST=...
MAIL_PORT=...
MAIL_USER=...
MAIL_PASS=...
MAIL_SECURE=true/false

# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Midtrans
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
MIDTRANS_ID_MERCHANT=...

# Gemini API Keys (Rotasi Otomatis)
GEMINI_API_KEYS=["key1","key2",...]

```

> ❗ Jangan commit `.env` atau kunci API ke publik repository.

---

## 📚 Dokumentasi API

Setelah server berjalan, akses dokumentasi Swagger di:
```
http://localhost:10000/
```

---

## 🧰 Tools & Library

- Hapi.js
- Joi
- Supabase JS SDK
- Midtrans Client
- Nodemailer
- Puppeteer
- Google Generative AI SDK
- dotenv
- cron & job worker
- Swagger (via hapi-swagger)

---

## 👥 Kontributor

- [Efrino Wahyu Eko P](https://github.com/efrino) — Developer

---

## 📝 Lisensi

Proyek ini dilisensikan di bawah lisensi **ISC**.

---