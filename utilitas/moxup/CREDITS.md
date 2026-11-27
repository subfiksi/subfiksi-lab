# Kredit aset & pustaka

## Model 3D (`models/`)

| Produk | Model | Pembuat | Lisensi | Sumber |
|---|---|---|---|---|
| Mug | Coffee Mug (`mug_fuchs.glb`) | Michael Fuchs | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://poly.pizza/m/eYH-QqBybgU |
| Cangkir | Diffuse Transmission Teacup (`kh_teacup.glb`) | Poly Haven & Eric Chadwick | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DiffuseTransmissionTeacup |
| Piring | Carved Wooden Plate (`ph_carved_wooden_plate.glb`) | Jan Martens | CC0 | https://polyhaven.com/a/carved_wooden_plate |
| Botol | Water Bottle (`kh_water_bottle.glb`) | Microsoft | CC0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/WaterBottle |
| Termos | Plastic Thermos (`ph_plastic_thermos.glb`) | PierreB3D | CC0 | https://polyhaven.com/a/plastic_thermos |
| Tumbler | Tidak diunduh: bentuk dibuat oleh aplikasi (`models.js`) | - | - | - |
| Cup Kopi, Kaleng 330ml, Kaleng Slim, Botol Skincare | Dibuat oleh aplikasi (`containers.js`, wadah 96-segmen + detail tutup/pump) | - | - | - |
| Box Sepatu, Kue, Mailer, Kubus, Tinggi | Dibuat oleh aplikasi (`boxes.js`, box ber-bevel halus) | - | - | - |
| T-Shirt | T_Shirt_male (`shirt_baked.glb`) | accodes21 / tshirt3d | MIT | https://github.com/accodes21/tshirt3d |
| Kaos Polo | White polo (`white_polo.glb`) | hasar | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/white-polo-e72910b19cc949919584e0ba60678c31 |
| Hoodie | Hoodie (`hoodie.glb`) | yogaminggames | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/hoodie-2c674228f1e946b5b8f508f8f818e130 |
| Kemeja | Kemeja Putih (`kemeja_putih_mockup.glb`) | Bendrat | - | - |
| Kemeja PDL | Kemeja Lapangan (`kemeja_lapangan_mockup.glb`) | Bendrat | - | - |

Perubahan dari file asli:
- Semua model kecuali Mug: tekstur, peta UV, dan data yang tidak dipakai dilepas, lalu disimpan sebagai satu `.glb`.
- Semua model: warna diganti dan permukaan dihaluskan saat aplikasi berjalan (file tidak diubah).

Model CC-BY (Mug) wajib mencantumkan nama pembuat. Aplikasi menampilkannya di tab Produk; kalau hasil
mockup dipakai di tempat lain bersama modelnya, cantumkan kredit di atas.

## Cahaya (`env/`)

Peta cahaya 360 derajat dari [Poly Haven](https://polyhaven.com), lisensi CC0, ukuran 1k:

| Pilihan di aplikasi | File | Pembuat |
|---|---|---|
| Studio terang | `photo_studio_01.hdr` | Sergej Majboroda |
| Studio lembut | `studio_small_08.hdr` | Sergej Majboroda |
| Siang mendung | `overcast_soil_puresky.hdr` | Jarod Guest, Sergej Majboroda |
| Ruangan hangat | `brown_photostudio_02.hdr` | Sergej Majboroda |

## Huruf (`vendor/fonts/`)

Semua berlisensi [SIL Open Font License 1.1](https://openfontlicense.org), diambil dari paket
[Fontsource](https://fontsource.org): Plus Jakarta Sans (Tokotype), Playfair Display, Bebas Neue,
Fredoka, Pacifico, Great Vibes, Caveat.

## Pustaka

- [three.js](https://threejs.org) r170, lisensi MIT (`vendor/THREE_LICENSE.txt`).
- Sistem antarmuka **Subtils UI** (`vendor/subtils/`) dengan ikon vektor **Phosphor Icons** (*Fill weight*), lisensi MIT (`vendor/subtils/PHOSPHOR-LICENSE.txt`).
