# MOXUP (offline)

Tempel desain ke produk 3D (mug, cangkir, piring, tumbler, botol, termos), atur tampilannya, lalu
unduh sebagai gambar. Semua berjalan di browser komputer Anda; tidak ada data yang dikirim ke mana pun
dan tidak perlu internet.

## Menjalankan

**Windows:** klik dua kali `MOXUP LAUNCHER.bat`. Browser terbuka sendiri di aplikasinya. Tidak perlu memasang
apa pun: server kecilnya (`serve.ps1`) memakai PowerShell bawaan Windows. Biarkan jendela hitamnya
terbuka selama memakai aplikasi; tutup jendela itu untuk berhenti.

**macOS / Linux:** jalankan `sh start.sh` (memakai `python3` bawaan sistem).

Jangan membuka `index.html` langsung: browser menolak memuat skrip dan model dari file://, dan
halaman menampilkan pesan untuk memakai `MOXUP LAUNCHER.bat`.

## Yang bisa diatur

| Tab | Isi |
|---|---|
| 1. Produk | Enam produk, warna badan, dua warna (bagian dalam & gagang), warna tutup/alas/tatakan, bahan (keramik kilap, doff, stainless, plastik) atau atur sendiri (kilap, efek logam, glasir). |
| 2. Desain | Banyak gambar dan teks sekaligus. Seret di produk untuk memindahkan, tarik sudut untuk ukuran, tarik titik atas untuk memutar. Letak cepat, paskan, melingkar penuh, balik, gandakan, salin ke sisi belakang, urutan. Gambar: hapus latar putih, kecerahan, kontras, kekuatan warna. Teks: 7 jenis huruf, warna, tebal/miring, rata, lengkung, jarak huruf, garis tepi. Pola berulang. Mode tinta menyatu (tanpa tinta putih). Perkiraan ukuran cetak dalam cm dan peringatan gambar beresolusi rendah. |
| 3. Tampilan | Bentuk gambar (bebas, 1:1, 4:5, 9:16, 16:9, 4:3), latar (warna, gradasi, suasana ruangan, foto sendiri, transparan), 5 pilihan cahaya, kecerahan, arah cahaya, bayangan, lensa, geser produk, putar otomatis. |
| 4. Unduh | PNG / JPG / WebP, tiga ukuran (sampai 4000 piksel), kualitas, tanpa latar, nama file, salin ke clipboard. |

Urungkan/ulangi (Ctrl+Z / Ctrl+Y), tempel gambar (Ctrl+V), seret file ke produk, Delete, dan tombol panah juga berfungsi.

## Susunan kode

| File | Tugas |
|---|---|
| `index.html` | Tampilan dan semua kontrol. Kontrol terhubung ke pengaturan lewat atribut `data-k` / `data-chips`. |
| `app.js` | Pengaturan (`state`), riwayat urungkan, tombol, seret desain di produk, unduh. |
| `stage.js` | Sisi 3D (three.js): produk, bahan, cahaya, bayangan, kamera, dan shader yang menempelkan desain. |
| `design.js` | Menggambar semua elemen desain ke satu kanvas cetak (gambar, teks, pola, bingkai pilihan). |
| `layout.js` | Hitungan posisi/ukuran elemen dan gerakan seret. Murni matematika, ada tesnya. |
| `analyze.js` | Mengukur model: sumbu badan, profil jari-jari per ketinggian, arah gagang. Ada tesnya. |
| `models.js` | Daftar produk. |
| `presets.js` | Pilihan bahan, cahaya, huruf, warna, bentuk gambar, jenis file. |

Cara kerja penempelan desain: `design.js` menggambar seluruh desain ke satu kanvas yang mewakili
"kertas cetak" produk (keliling badan x tinggi untuk mug/tumbler, bujur sangkar untuk piring). Shader di
`stage.js` memproyeksikan kanvas itu ke badan produk tanpa memakai peta UV bawaan model, dan memakai
profil dari `analyze.js` agar gagang tidak ikut tercetak. Karena itu model gratis apa pun yang berbentuk
tabung atau piring bisa dipakai tanpa diedit di Blender.

## Menambah produk

1. Taruh file `.glb` di `models/` (sumbu tegak = Y, seperti standar glTF).
2. Tambah satu entri di `models.js` (penjelasan tiap kolom ada di bagian atas file itu).
3. Catat pembuat dan lisensinya di `CREDITS.md`.

Gambar kecil di daftar produk dibuat otomatis.

Tanpa mengubah kode: tab **1. Produk → Model 3D Sendiri (.glb)** membuka file `.glb` langsung di browser
(lewat `blob:` URL, tidak dikirim ke server). Pilih cara tempel (melingkar / permukaan atas / peta UV) dan
tinggi asli dalam cm. Model ini hilang saat halaman dimuat ulang.

Menambah pilihan cahaya: taruh file `.hdr` di `env/`, tambah satu baris `ENVS` di `presets.js`.

## Tes

Butuh Node.js (hanya untuk tes, bukan untuk memakai aplikasi):

```
node tests/analyze.test.mjs
node tests/layout.test.mjs
```
