# 🤖 Daily Bot — Catatan Keuangan Harian, Gaji & Absen Keberangkatan Kerja

Bot Telegram pintar untuk mencatat **keuangan harian**, **gaji**, dan **absen keberangkatan kerja** secara simpel, cepat, dan tanpa friksi. Ditenagai oleh **grammY (TypeScript)** dan **Neon (Serverless PostgreSQL)**.

---

## ✨ Fitur Utama

### 1. 💸 Catatan Keuangan Cepat (Single-Shot Input)
Cukup ketik nominal dan catatan dalam satu pesan — bot otomatis mengenali kategori dan nominal uang:
* `kopi 18rb @gopay` *(otomatis masuk ke Makan & Minum, dompet GoPay)*
* `bensin 30k` *(masuk ke Transportasi, dompet default)*
* `makan siang 25.000`
* `+gaji 5.500.000 @bca` *(tanda `+` untuk pemasukan)*
* `+bonus freelance 1.5jt`

### 2. 🚗 Absen Keberangkatan Simpel (1 Tap)
* Tombol tetap **"🚗 Berangkat Kerja"**: 1 tap langsung mencatat kehadiran hari ini.
* Setelah tap berangkat, bot menawarkan tombol cepat: *"Catat ongkos/bensin hari ini? [Rp10.000] [Rp15.000] [Lewati]"*.
* Tombol **"🏖️ Tidak Masuk"**: pilihan cepat status `Libur Rutin`, `Izin`, `Sakit`, atau `Cuti`.
* Rekap kehadiran bulanan otomatis menghitung total hari masuk kerja.

### 3. 💼 Info & Estimasi Gaji Real-Time
* Terhubung langsung dengan data absensi keberangkatan kerja!
* Menghitung total hari berangkat × tunjangan harian (uang makan/transport) atau upah harian.
* Estimasi gaji bersih otomatis terakumulasi setiap kali kamu tap berangkat.

### 4. 💳 Dompet & Rekening
* Multi-dompet: Tunai, BCA, Mandiri, GoPay, OVO, DANA, dll.
* Cek saldo kapan saja dengan tombol atau perintah `/saldo`.

---

## 🛠️ Tech Stack & Best Practices

| Komponen | Teknologi |
|---|---|
| **Runtime & Bahasa** | TypeScript (Node.js 22 / Bun) |
| **Framework Bot** | [grammY](https://grammy.dev/) |
| **Web Server / Webhook** | [Hono](https://hono.dev/) |
| **Database** | [Neon](https://neon.tech/) (Serverless PostgreSQL) |
| **ORM & Migrations** | [Drizzle ORM](https://orm.drizzle.team/) + Drizzle Kit |
| **Validasi Konfigurasi** | Zod |
| **Format Uang** | `BIGINT` (Rupiah murni tanpa floating-point error) |
| **Keamanan** | Private chat only + Secret Token Webhook + Rate Limiting |

---

## 🚀 Panduan Memulai (Quick Start)

### 1. Prasyarat
* Node.js v20+ atau [Bun](https://bun.sh/)
* Akun Telegram & Bot Token dari [@BotFather](https://t.me/botfather)
* Akun dan Database gratis di [Neon Console](https://console.neon.tech/)

### 2. Salin Repositori & Install Dependensi
```bash
bun install
# atau
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi konfigurasi berikut:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
DATABASE_URL=postgresql://neondb_owner:password@ep-cool-frost-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
WEBHOOK_SECRET=rahasia_token_webhook_123
DEFAULT_TIMEZONE=Asia/Jakarta
```

### 4. Push Skema ke Database Neon
Jalankan migrasi untuk membuat seluruh tabel di Neon secara otomatis:
```bash
bun run db:push
# atau
npm run db:push
```

### 5. Jalankan Bot di Lokal (Mode Long-Polling)
Untuk pengembangan lokal tanpa perlu domain publik atau ngrok:
```bash
bun run dev:polling
# atau
npm run dev:polling
```
Buka bot kamu di Telegram dan ketik `/start`! 🎉

---

## 📂 Struktur Project

```
bot-tele-daily/
├── docs/
│   └── PRD.md                 # Product Requirement Document lengkap
├── drizzle/                   # Berkas migrasi SQL otomatis
├── src/
│   ├── index.ts               # Server Hono untuk Webhook Telegram & Health check
│   ├── dev-polling.ts         # Runner lokal via Long Polling (tanpa ngrok)
│   ├── config/
│   │   └── env.ts             # Validasi environment variable Zod
│   ├── db/
│   │   ├── index.ts           # Koneksi serverless Neon + Drizzle client
│   │   └── schema.ts          # Skema PostgreSQL (users, wallets, transactions, attendances, dll)
│   ├── bot/
│   │   ├── bot.ts             # Logika bot grammY, middleware, dan command handlers
│   │   ├── keyboards.ts       # Reply keyboard menu dan inline buttons
│   │   └── modules/
│   │       ├── user.ts        # Registrasi & seed otomatis dompet/kategori default
│   │       ├── finance.ts     # Logika transaksi cepat, saldo, dan laporan harian
│   │       ├── attendance.ts  # Logika absen keberangkatan & ongkos perjalanan
│   │       └── salary.ts      # Estimasi gaji bulanan/harian
│   └── lib/
│       ├── money-parser.ts    # Regex parser nominal Indonesia ('25rb', '1.5jt', dsb.)
│       └── date.ts            # Helper tanggal zona waktu Indonesia (Asia/Jakarta)
├── tests/
│   └── money-parser.test.ts   # Unit test parser nominal
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## 🧪 Menjalankan Pengujian (Testing)

```bash
bun test
# atau
npm test
```
