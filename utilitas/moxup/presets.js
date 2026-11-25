// Pilihan siap pakai yang tampil di panel. Mengubah daftar di sini langsung mengubah pilihannya.

// gloss = kilap (0 doff .. 1 mengilap), metal = efek logam, coat = lapisan glasir bening
export const FINISHES = {
  glossy: { label: 'Keramik kilap', v: { gloss: 0.8, metal: 0, coat: 0.7 } },
  matte: { label: 'Doff', v: { gloss: 0.32, metal: 0, coat: 0 } },
  steel: { label: 'Stainless', v: { gloss: 0.74, metal: 1, coat: 0 } },
  satin: { label: 'Plastik', v: { gloss: 0.6, metal: 0, coat: 0.25 } },
  carton: { label: 'Karton', v: { gloss: 0.22, metal: 0, coat: 0.06 } },
  fabric: { label: 'Kain', v: { gloss: 0.14, metal: 0, coat: 0 } },
};

export const TEXTURES = {
  none: { label: 'Polos', v: { strength: 0, scale: 6 } },
  carton: { label: 'Karton', v: { strength: 0.45, scale: 6 } },
  cardboard: { label: 'Kardus', v: { strength: 0.65, scale: 5 } },
  fabric: { label: 'Kain', v: { strength: 0.55, scale: 8 } },
};

// file = peta cahaya 360 derajat (.hdr) di folder env/; null = cahaya ruangan bawaan three.js
// Dipilih yang netral: produk putih tetap putih (tanpa semburat biru atau kuning).
export const ENVS = {
  studio: { label: 'Studio terang', file: 'env/photo_studio_01.hdr' },
  soft: { label: 'Studio lembut', file: 'env/studio_small_08.hdr' },
  cloudy: { label: 'Siang mendung', file: 'env/overcast_soil_puresky.hdr' },
  warm: { label: 'Ruangan hangat', file: 'env/brown_photostudio_02.hdr' },
  basic: { label: 'Sederhana', file: null },
};

// name harus sama dengan @font-face di index.html
export const FONTS = [
  { name: 'Plus Jakarta Sans', label: 'Modern' },
  { name: 'Playfair Display', label: 'Elegan' },
  { name: 'Bebas Neue', label: 'Tegas' },
  { name: 'Fredoka', label: 'Ceria' },
  { name: 'Pacifico', label: 'Santai' },
  { name: 'Great Vibes', label: 'Kaligrafi' },
  { name: 'Caveat', label: 'Tulisan tangan' },
];

export const SWATCHES = ['#ffffff', '#0d1b54', '#c8102e', '#d4af37', '#f5efe0', '#111827', '#6b7280', '#f97316', '#facc15', '#16a34a', '#0ea5e9', '#1d4ed8', '#7c3aed', '#f9a8d4'];
export const BG_SWATCHES = ['#ECEFF3', '#ffffff', '#16171A', '#003380', '#FF6600', '#f6efe6', '#e0f2fe', '#0f172a'];

// lebar : tinggi; null = mengikuti ukuran jendela
export const RATIOS = { free: null, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16, '16:9': 16 / 9, '4:3': 4 / 3 };

export const FORMATS = {
  png: { mime: 'image/png', alpha: true },
  jpg: { mime: 'image/jpeg', alpha: false },
  webp: { mime: 'image/webp', alpha: true },
};
