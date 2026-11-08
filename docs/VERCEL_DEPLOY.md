# 🚀 Panduan Deploy Daily Bot ke Vercel

Proyek ini telah dikonfigurasi penuh agar siap di-deploy ke **Vercel** menggunakan **Hono Serverless** dan **Neon PostgreSQL**.

---

## 📋 Langkah-Langkah Deploy

### 1. Push Kode ke GitHub
Pastikan semua perubahan sudah di-commit dan di-push ke repositori GitHub kamu:
```bash
git add .
git commit -m "feat: setup vercel serverless deployment"
git push origin main
```

---

### 2. Import Project di Vercel Console
1. Buka dashboard [Vercel](https://vercel.com/) dan login.
2. Klik tombol **"Add New..."** $\rightarrow$ **"Project"**.
3. Pilih repositori GitHub `bot-tele-daily`.
4. Pada bagian **Build & Development Settings**:
   * **Framework Preset:** Pilih `Other` (atau biarkan default).
   * **Root Directory:** `./`
5. Pada bagian **Environment Variables**, tambahkan variabel berikut (ambil dari file `.env` kamu):

| Variable Name | Nilai / Keterangan |
|---|---|
| `BOT_TOKEN` | Token dari @BotFather (contoh: `9198144479:AAFaq...`) |
| `DATABASE_URL` | URL PostgreSQL Neon kamu |
| `WEBHOOK_SECRET` | Token rahasia webhook (contoh: `super_secret_webhook_token_123`) |
| `DEFAULT_TIMEZONE` | `Asia/Jakarta` |
| `ALLOWED_TELEGRAM_IDS` | *(Opsional)* ID Telegram kamu jika ingin mode privat |

6. Klik tombol **Deploy** dan tunggu proses build selesai (~30-60 detik).
7. Salin domain yang diberikan oleh Vercel, misalnya:
   `https://bot-tele-daily.vercel.app`

---

### 3. Daftarkan Webhook Telegram ke Domain Vercel
Setelah aplikasi live di Vercel, daftarkan URL webhook Telegram dengan menjalankan perintah berikut di terminal komputermu:

```bash
bun run webhook:set https://bot-tele-daily.vercel.app
# atau jika memakai npm:
npm run webhook:set https://bot-tele-daily.vercel.app
```

Jika berhasil, terminal akan menampilkan:
```
📡 Mendaftarkan Webhook Telegram ke: https://bot-tele-daily.vercel.app/webhook
✅ Webhook Telegram BERHASIL didaftarkan!
```

---

### 4. Selesai! 🎉
Bot kamu sekarang sudah berjalan **24/7 di cloud Vercel** tanpa perlu laptop menyala:
* Setiap ada pesan chat dari pengguna, Telegram langsung mengirim update via Webhook ke serverless Vercel.
* Respon instan dengan latensi rendah berkat driver HTTP `@neondatabase/serverless`.

---

## ⏰ Pengingat Terjadwal (Vercel Cron Jobs)

File [`vercel.json`](file:///c:/Users/Es%20Nurohman/Desktop/PROJECT/bot-tele-daily/vercel.json) sudah otomatis mengonfigurasi **Vercel Cron Jobs** gratis:

1. **07:30 WIB (00:30 UTC):** Pengingat absen pagi bagi yang belum absen.
2. **08:00 WIB (01:00 UTC):** Notifikasi selamat hari gajian & estimasi hak gaji bersih.
3. **21:00 WIB (14:00 UTC):** Rekap keuangan dan status kehadiran malam hari.

Semua cron otomatis memanggil endpoint `/api/cron/reminders` secara berkala.
