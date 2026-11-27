// Daftar produk. Menambah produk = taruh file .glb di models/ atau definisikan box di boxes.js.
//
// cat     'drink' = gelas/botol/piring, 'box' = kemasan, 'apparel' = baju
// mode    'cyl' = melingkari badan; 'top' = permukaan atas (piring); 'uv' = proyeksi UV langsung
// realCm  ukuran asli untuk perkiraan ukuran cetak
// finish  bahan awal, salah satu kunci FINISHES di presets.js
// twoTone true = bagian dalam dan gagang bisa diberi warna lain
// parts   material yang tidak dicetak dan punya warna sendiri: { namaMaterial: { label, color, follow } }
// zones   bagian atas/bawah badan yang tidak dicetak ('cyl'): cap / base
// shape   LatheGeometry profil [jari-jari, tinggi]
// box     box kemasan ber-bevel halus dari boxes.js ({ style, w, h, d, r })
// container wadah prosedural (kaleng, cup kopi, botol skincare) dari containers.js
// safe    area aman default untuk mode 'uv' ({ x, y, w, h, y0, y1 })
// places  tombol letak cepat untuk mode 'uv' ([{ label, x, y, az, el }])
// Lisensi & sumber tiap model: lihat CREDITS.md

const BOX_PLACES = (w, h, d) => {
  const k = 0.90 / Math.max(w + 2 * h, d + 2 * h);
  const W = w * k, H = h * k, D = d * k;
  return [
    { label: 'Atas', x: 0.5, y: 0.5, az: 0, el: 75 },
    { label: 'Depan', x: 0.5, y: 0.5 - (D + H) / 2, az: 0, el: 16 },
    { label: 'Kiri', x: 0.5 - (W + H) / 2, y: 0.5, az: -90, el: 16 },
    { label: 'Kanan', x: 0.5 + (W + H) / 2, y: 0.5, az: 90, el: 16 },
    { label: 'Belakang', x: 0.5, y: 0.5 + (D + H) / 2, az: 180, el: 16 },
  ];
};

export const MODELS = [
  // --- GELAS & WADAH ---
  {
    id: 'mug', cat: 'drink', name: 'Mug', file: 'models/mug_fuchs.glb', mode: 'cyl', realCm: 9.5, finish: 'glossy', twoTone: true,
    credit: '"Coffee Mug" oleh Michael Fuchs, CC-BY 3.0, via Poly Pizza',
  },
  {
    id: 'cangkir', cat: 'drink', name: 'Cangkir', file: 'models/kh_teacup.glb', mode: 'cyl', realCm: 6, finish: 'glossy', twoTone: true,
    parts: { tea_saucer: { label: 'Tatakan', color: '#ffffff', follow: true } },
    credit: '"Diffuse Transmission Teacup" oleh Poly Haven & Eric Chadwick, CC0, via Khronos glTF Sample Assets',
  },
  {
    id: 'piring', cat: 'drink', name: 'Piring', file: 'models/ph_carved_wooden_plate.glb', mode: 'top', realCm: 25, finish: 'glossy',
    credit: '"Carved Wooden Plate" oleh Jan Martens, CC0, via Poly Haven',
  },
  {
    id: 'tumbler', cat: 'drink', name: 'Tumbler', mode: 'cyl', realCm: 17.5, finish: 'matte',
    shape: {
      body: [[0, 0.25], [2.9, 0.25], [3.05, 0], [3.3, 0], [3.45, 0.35], [4.35, 16.6], [4.45, 17], [4.45, 17.5], [4.25, 17.5], [4.2, 16.9]],
      lid: [[4.22, 16.9], [4.22, 17.75], [4.05, 17.95], [3.45, 17.95], [3.3, 17.75], [0, 17.75]],
    },
    parts: { lid: { label: 'Tutup', color: '#22262b' } },
    credit: 'Bentuk tumbler dibuat oleh MOXUP',
  },
  {
    id: 'botol', cat: 'drink', name: 'Botol', file: 'models/kh_water_bottle.glb', mode: 'cyl', realCm: 24, finish: 'steel',
    zones: { cap: { v: 0.855, label: 'Tutup', color: '#1f2328' }, base: { v: 0.43, label: 'Sarung bawah', color: '#2b3038' } },
    credit: '"Water Bottle" oleh Microsoft, CC0, via Khronos glTF Sample Assets',
  },
  {
    id: 'termos', cat: 'drink', name: 'Termos', file: 'models/ph_plastic_thermos.glb', mode: 'cyl', realCm: 30, finish: 'satin',
    zones: { cap: { v: 0.73, label: 'Tutup', color: '#e5e7eb' }, base: { v: 0.1, label: 'Alas', color: '#e5e7eb' } },
    credit: '"Plastic Thermos" oleh PierreB3D, CC0, via Poly Haven',
  },
  {
    id: 'cup-kopi', cat: 'drink', name: 'Cup Kopi', mode: 'cyl', realCm: 12.2, finish: 'carton', texture: 'carton',
    container: { kind: 'coffee', rBot: 2.95, r: 4.26, h: 10.7 },
    cylBand: [0.06, 0.94],
    parts: { lid: { label: 'Tutup', color: '#1d2026', roughness: 0.48 } },
    view: [-24, 18],
    credit: 'Cup kopi & tutup dibuat oleh MOXUP',
  },

  // --- KEMASAN (BEVELED STUDIO BOXES & WADAH) ---
  {
    id: 'kaleng-330', cat: 'box', name: 'Kaleng 330ml', mode: 'cyl', realCm: 11.5, finish: 'steel',
    container: { kind: 'can', r: 3.30, h: 11.5 },
    cylBand: [0.06, 0.88],
    parts: { lid: { label: 'Tutup & ring', color: '#d8dde4', metal: 0.9, roughness: 0.24 } },
    view: [-24, 18],
    credit: 'Kaleng 330ml dibuat oleh MOXUP',
  },
  {
    id: 'kaleng-slim', cat: 'box', name: 'Kaleng Slim', mode: 'cyl', realCm: 14.6, finish: 'steel',
    container: { kind: 'can', r: 2.65, h: 14.6 },
    cylBand: [0.06, 0.88],
    parts: { lid: { label: 'Tutup & ring', color: '#d8dde4', metal: 0.9, roughness: 0.24 } },
    view: [-24, 18],
    credit: 'Kaleng slim dibuat oleh MOXUP',
  },
  {
    id: 'botol-skincare', cat: 'box', name: 'Botol Skincare', mode: 'cyl', realCm: 14.5, finish: 'satin',
    container: { kind: 'skincare', r: 2.40, h: 10.4 },
    cylBand: [0.05, 0.78],
    parts: {
      collar: { label: 'Leher pompa', color: '#d4af37', metal: 0.88, roughness: 0.22 },
      pump: { label: 'Kepala pump', color: '#ffffff', roughness: 0.34, clearcoat: 0.12 },
    },
    view: [-22, 16],
    credit: 'Botol skincare dibuat oleh MOXUP',
  },
  {
    id: 'box-sepatu', cat: 'box', name: 'Box Sepatu', mode: 'uv', realCm: 32, finish: 'carton', texture: 'carton',
    box: { style: 'shoe', w: 3.2, h: 1.25, d: 2.0, r: 0.035 },
    parts: { tray: { label: 'Kotak bawah', color: '#e3e7ee', follow: true } },
    safe: { x: 0.5, y: 0.5, w: 0.52, h: 0.34, y0: 0.25, y1: 0.75 },
    places: BOX_PLACES(3.34, 0.44, 2.14),
    view: [-32, 26],
    credit: 'Box kemasan ber-bevel dibuat oleh MOXUP',
  },
  {
    id: 'kotak-kue', cat: 'box', name: 'Kotak Kue', mode: 'uv', realCm: 22, finish: 'carton', texture: 'carton',
    box: { style: 'cake', w: 2.2, h: 1.35, d: 2.2, r: 0.04 },
    parts: { accent: { label: 'Tab tutup', color: '#e3e7ee', follow: true } },
    safe: { x: 0.5, y: 0.5, w: 0.32, h: 0.32, y0: 0.12, y1: 0.88 },
    places: BOX_PLACES(2.2, 1.35, 2.2),
    view: [-32, 24],
    credit: 'Kotak kue ber-bevel dibuat oleh MOXUP',
  },
  {
    id: 'box-mailer', cat: 'box', name: 'Box Mailer', mode: 'uv', realCm: 26, finish: 'carton', texture: 'cardboard',
    box: { style: 'mailer', w: 2.6, h: 0.78, d: 2.0, r: 0.035 },
    parts: { accent: { label: 'Celah buka', color: '#cbd5e1', follow: true } },
    safe: { x: 0.5, y: 0.5, w: 0.44, h: 0.34, y0: 0.18, y1: 0.82 },
    places: BOX_PLACES(2.6, 0.78, 2.0),
    view: [-30, 30],
    credit: 'Box mailer ber-bevel dibuat oleh MOXUP',
  },
  {
    id: 'box-kubus', cat: 'box', name: 'Box Kubus', mode: 'uv', realCm: 16, finish: 'carton', texture: 'carton',
    box: { style: 'cube', w: 1.6, h: 1.6, d: 1.6, r: 0.045 },
    safe: { x: 0.5, y: 0.5, w: 0.24, h: 0.24, y0: 0.10, y1: 0.90 },
    places: BOX_PLACES(1.6, 1.6, 1.6),
    view: [-34, 24],
    credit: 'Box kubus ber-bevel dibuat oleh MOXUP',
  },
  {
    id: 'box-tinggi', cat: 'box', name: 'Box Tinggi', mode: 'uv', realCm: 21, finish: 'carton', texture: 'carton',
    box: { style: 'tall', w: 1.3, h: 2.1, d: 1.3, r: 0.035 },
    safe: { x: 0.5, y: 0.18, w: 0.18, h: 0.24, y0: 0.06, y1: 0.94 },
    places: BOX_PLACES(1.3, 2.1, 1.3),
    view: [-30, 18],
    credit: 'Box kemasan tinggi ber-bevel dibuat oleh MOXUP',
  },

  // --- BAJU ---
  {
    id: 'tshirt', cat: 'apparel', name: 'T-Shirt', file: 'models/shirt_baked.glb', mode: 'uv', realCm: 70, finish: 'fabric', texture: 'fabric',
    safe: { x: 0.26, y: 0.69, w: 0.22, h: 0.28, y0: 0.20, y1: 0.88 },
    places: [
      { label: 'Dada', x: 0.26, y: 0.69, az: 0, el: 8 },
      { label: 'Dada Kiri', x: 0.34, y: 0.74, az: 0, el: 8 },
      { label: 'Punggung', x: 0.74, y: 0.72, az: 180, el: 8 },
    ],
    view: [0, 8],
    credit: '"T_Shirt_male" oleh accodes21/tshirt3d, MIT License, via GitHub',
  },
  {
    id: 'polo', cat: 'apparel', name: 'Kaos Polo', file: 'models/white_polo.glb', mode: 'uv', keepUvY: true, realCm: 72, finish: 'fabric', texture: 'fabric',
    parts: {
      buttons: { label: 'Kancing', color: '#f8fafc', roughness: 0.25, clearcoat: 0.35 },
    },
    safe: { x: 0.26, y: 0.52, w: 0.20, h: 0.26, y0: 0.14, y1: 0.88 },
    places: [
      { label: 'Dada', x: 0.26, y: 0.52, az: 0, el: 8 },
      { label: 'Dada Kiri', x: 0.34, y: 0.72, az: 0, el: 8 },
      { label: 'Punggung', x: 0.74, y: 0.72, az: 180, el: 8 },
    ],
    view: [0, 8],
    credit: '"White polo" oleh hasar, CC-BY 4.0, via Sketchfab',
  },
  {
    id: 'kemeja', cat: 'apparel', name: 'Kemeja', file: 'models/kemeja_putih_mockup.glb', mode: 'uv', keepUvY: true, realCm: 75, finish: 'fabric', texture: 'fabric',
    parts: {
      Mat_Shirt_Buttons: { label: 'Kancing', color: '#f4f4f0', roughness: 0.2, metal: 0.04, clearcoat: 0.3 },
    },
    safe: { x: 0.147, y: 0.735, w: 0.12, h: 0.14, y0: 0.27, y1: 0.91 },
    places: [
      { label: 'Dada Kanan', x: 0.147, y: 0.735, az: 0, el: 8 },
      { label: 'Saku', x: 0.353, y: 0.715, az: 0, el: 8 },
      { label: 'Punggung', x: 0.75, y: 0.735, az: 180, el: 8 },
      { label: 'Lengan Kiri', x: 0.17, y: 0.105, az: -90, el: 10 },
      { label: 'Lengan Kanan', x: 0.67, y: 0.105, az: 90, el: 10 },
    ],
    view: [0, 8],
    credit: 'Kemeja Putih 3D dibuat oleh Bendrat',
  },
  {
    id: 'kemeja-lapangan', cat: 'apparel', name: 'Kemeja PDL', file: 'models/kemeja_lapangan_mockup.glb', mode: 'uv', keepUvY: true, realCm: 75, finish: 'fabric', texture: 'fabric',
    parts: {
      Mat_Shirt_Buttons: { label: 'Kancing', color: '#e6dfd0', roughness: 0.22, metal: 0.04, clearcoat: 0.25 },
    },
    safe: { x: 0.353, y: 0.835, w: 0.11, h: 0.11, y0: 0.27, y1: 0.94 },
    places: [
      { label: 'Dada Kiri', x: 0.353, y: 0.835, az: 0, el: 8 },
      { label: 'Dada Kanan', x: 0.147, y: 0.835, az: 0, el: 8 },
      { label: 'Saku', x: 0.353, y: 0.695, az: 0, el: 8 },
      { label: 'Lengan Kiri', x: 0.17, y: 0.105, az: -90, el: 10 },
      { label: 'Lengan Kanan', x: 0.67, y: 0.105, az: 90, el: 10 },
      { label: 'Punggung', x: 0.75, y: 0.835, az: 180, el: 8 },
    ],
    view: [0, 8],
    credit: 'Kemeja Lapangan (PDL) 3D dibuat oleh Bendrat',
  },
  {
    id: 'hoodie', cat: 'apparel', name: 'Hoodie', file: 'models/hoodie.glb', mode: 'uv', keepUvY: true, realCm: 74, finish: 'fabric', texture: 'fabric',
    safe: { x: 0.26, y: 0.64, w: 0.20, h: 0.24, y0: 0.42, y1: 0.86 },
    places: [
      { label: 'Dada', x: 0.26, y: 0.64, az: 0, el: 8 },
      { label: 'Dada Kiri', x: 0.34, y: 0.69, az: 0, el: 8 },
      { label: 'Punggung', x: 0.74, y: 0.58, az: 180, el: 8 },
    ],
    view: [0, 8],
    credit: '"Hoodie" oleh yogaminggames, CC-BY 4.0, via Sketchfab',
  },
];
