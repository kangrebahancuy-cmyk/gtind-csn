# Tutorial Deploy GTIND-CSN ke Render (Gratis, Tanpa Kartu Kredit)

Tutorial ini memindahkan seluruh aplikasi (frontend + backend + WebSocket) dari Vercel ke Render.
Setelah selesai, error `GET /api/crash/state 404` dan `WebSocket ... /ws failed` tidak akan muncul lagi,
karena backend Express yang melayani endpoint tersebut akan ikut jalan.

---

## 0. Hal yang perlu diketahui dulu

| Hal | Penjelasan |
|---|---|
| Gratis? | Ya, free tier Render tidak minta kartu kredit. Cukup login pakai akun GitHub. |
| Satu URL | Frontend dan backend berjalan di satu URL `https://<nama>.onrender.com`. Tidak perlu ubah kode. |
| Sleep | Kalau 15 menit tidak ada pengunjung, server tidur. Pengunjung pertama menunggu ±30–60 detik (cold start). |
| Data hilang saat restart | Free tier memakai disk ephemeral. Saldo/akun/deposit di SQLite **reset** setiap redeploy atau restart. Jangan simpan nilai WL/DL sungguhan. |
| Kuota | 750 jam instance/bulan — cukup untuk 1 service yang jalan terus. |

---

## 1. Pastikan kode sudah ada di GitHub

Render men-deploy langsung dari repo GitHub.

1. Commit perubahan terbaru (termasuk `render.yaml` yang sudah diupdate di langkah ini).
2. Push ke GitHub dengan `upload_to_github.bat` atau manual:

   ```bash
   git add .
   git commit -m "siapkan deploy render"
   git push
   ```

3. Buka repo di github.com dan pastikan file `render.yaml` terlihat di root repo.

---

## 2. Daftar akun Render

1. Buka <https://dashboard.render.com>.
2. Klik **Sign up with GitHub** (atau Google/GitLab — GitHub paling mudah karena repo-nya di sana).
3. Authorize Render mengakses akun GitHub kamu.
4. Tidak akan ada permintaan kartu kredit.

---

## 3. Buat Web Service lewat Blueprint (cara termudah)

Karena repo sudah punya `render.yaml`, Render bisa membaca konfigurasinya otomatis.

1. Di dashboard Render, klik **New +** → pilih **Blueprint**.
2. Pilih repo GitHub `gtind-csn` (kalau tidak muncul, klik **Connect account/repository** dan izinkan akses ke repo tersebut).
3. Branch: `main` → klik **Connect**.
4. Render akan mendeteksi `render.yaml` dan menampilkan service `supreme-casino`.
5. Karena `render.yaml` menandai 3 variabel rahasia (`sync: false`), Render akan meminta nilainya. Isi:
   - `GTPS_WEBHOOK_SECRET` → string acak panjang (lihat cara buat di bawah).
   - `ADMIN_USERNAME` → username admin untuk login website, misal `admin`.
   - `ADMIN_PASSWORD` → password admin yang kuat.
6. Klik **Create / Apply** dan tunggu build selesai (±5–10 menit).

### Cara membuat secret acak

Di Git Bash:

```bash
openssl rand -hex 32
```

Salin hasilnya sebagai `GTPS_WEBHOOK_SECRET`. Jangan pakai password yang mudah ditebak.

---

## 4. Alternatif: buat Web Service manual

Kalau tidak lewat Blueprint:

1. **New +** → **Web Service** → pilih repo → **Connect**.
2. Isi form:
   - **Name:** `supreme-casino` (atau nama lain)
   - **Language/Runtime:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
3. Buka tab **Environment** → **Add Environment Variable**, isi:

   | Key | Value |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `SQLITE_DB_PATH` | `./data/gtind-csn.sqlite` |
   | `SQLITE_DATA_DIR` | `./data` |
   | `GTPS_WEBHOOK_SECRET` | string acak dari `openssl rand -hex 32` |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | password admin yang kuat |

   > `NODE_VERSION=24` **wajib**. Server memakai `node:sqlite` bawaan Node yang butuh Node 22.5+; kalau Render pakai Node lama, server gagal start.
4. Klik **Create Web Service**.

---

## 5. Pantau build & cek log

Buka tab **Events** / **Logs** milik service. Build yang sukses berakhir dengan log seperti:

```
[GTIND-CSN] Server running on port 10000
[GTIND-CSN] SQLite storage ready. Healthcheck: http://localhost:10000/healthz
```

Kalau build gagal, lihat bagian **Troubleshooting** di bawah.

---

## 6. Verifikasi hasil deploy

URL kamu ada di bagian atas halaman service, bentuknya `https://supreme-casino-xxxx.onrender.com`.

1. Buka `https://<url-render>/healthz` → harus muncul JSON `{"status":"ok",...}`.
2. Buka URL utamanya → website harus tampil.
3. Login, buka game **Crash**, lalu buka DevTools (F12) → tab **Network**:
   - `GET /api/crash/state` harus **200**, bukan 404 lagi.
   - Koneksi WebSocket ke `/ws` harus **101 Switching Protocols** / status connected.
4. Kalau menit-menit pertama terasa error/timeout, itu cold start — tunggu 30–60 detik lalu refresh.

---

## 7. Sambungkan ulang GTPS Lua (kalau dipakai)

Server game GTPS harus menunjuk ke URL Render yang baru:

1. Edit `gtps_lua/supreme_sync.lua`:
   - `WEB_API_URL` → `https://<url-render>` (ikuti format yang sudah ada di file itu).
   - `SECRET_KEY` → nilai `GTPS_WEBHOOK_SECRET` yang sama dengan di Render.
2. Restart/Reload script di server GTPS.

---

## 8. Bersih-bersih Vercel

1. Deployment lama di Vercel sebaiknya **dihapus atau di-suspend**, supaya pemain tidak membuka URL yang setiap detik melempar 404.
2. Kalau nanti pakai custom domain, arahkan DNS ke Render (Settings → Custom Domains di dashboard Render), bukan ke Vercel.

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Build gagal, log menyebut `node:sqlite` tidak ada / engine incompatibility | `NODE_VERSION` belum diset atau nilainya salah | Tab **Environment** → pastikan `NODE_VERSION` = `24` → klik **Manual Deploy** → Deploy latest commit |
| Health check timeout, deploy gagal | Server crash saat start, biasanya env kurang | Baca **Logs**; pastikan semua env di tabel langkah 4 terisi |
| Halaman terbuka tapi semua API 404 | Masih membuka URL Vercel yang lama | Pakai URL `onrender.com`; backend hanya hidup di sana |
| "Unable to join Crash round" terus | Server sedang tidur / baru bangun | Refresh setelah 30–60 detik |
| WebSocket gagal connect berkali-kali | Server tidur, reconnect loop frontend menabrak cold start | Normal di free tier; akan nyambung setelah server aktif |
| Saldo/akun tiba-tiba kembali kosong | Redeploy/restart menghapus disk ephemeral | Sifat free tier; backup penting tidak bisa disimpan di sini |
| Build butuh lebih dari 10 menit / antrian | Kuota free tier habis bulan itu | Tunggu reset kuota atau upgrade berbayar |

---

## Ringkasan arsitektur setelah deploy

```
Pemain browser
   │  https://<url-render>/
   ▼
Render Web Service (Node 24, free tier)
   ├─ Express (server.js) ─── dist/ hasil vite build  → frontend
   ├─ /api/*  ──── economy, wallet, games, admin, gtps
   ├─ /ws      ──── WebSocket chat, live bets, crash sync
   └─ SQLite   ──── data/gtind-csn.sqlite (ephemeral di free tier)
```

Frontend dan backend berada di **origin yang sama**, sehingga semua URL relatif (`/api/...`, `/ws`) di frontend langsung bekerja tanpa CORS dan tanpa perubahan kode.
