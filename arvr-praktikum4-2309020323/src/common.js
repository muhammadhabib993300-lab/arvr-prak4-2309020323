// src/common.js - fungsi bantu bersama untuk kedua demo (status dan pemeriksaan kamera)
const LOAD_TIMEOUT_MS = 60000; // batas waktu memuat (ms)

// Menampilkan status di elemen #status. state: idle | searching | found | error
export function setStatus(text, state) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.dataset.state = state;
}

// Memeriksa syarat dasar kamera. Mengembalikan null jika OK, atau pesan masalah.
export function checkCameraSupport() {
  if (!window.isSecureContext) {
    return 'Halaman bukan secure context. Buka lewat HTTPS (mis. GitHub Pages) '
      + 'atau http://localhost di laptop.';
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'Browser ini tidak menyediakan akses kamera (getUserMedia).';
  }
  return null;
}

// Menghubungkan tombol "Mulai" dengan fungsi start(). Kamera hanya diminta setelah tombol ditekan.
export function setupStartButton(startFn) {
  const btn = document.getElementById('startBtn');
  btn.addEventListener('click', async () => {
    const problem = checkCameraSupport();
    if (problem) { setStatus('Error: ' + problem, 'error'); return; }
    btn.disabled = true;
    document.getElementById('consent').style.display = 'none';
    setStatus('Memuat... izinkan kamera jika diminta', 'idle');
    try {
      // MindAR tidak selalu menolak (reject) saat unduhan model/target gagal; beri batas waktu.
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT_MS));
      await Promise.race([startFn(), timeout]);
    } catch (err) {
      // MindAR dapat menolak (reject) tanpa pesan, mis. izin kamera ditolak.
      console.error('Gagal memulai:', err);
      document.getElementById('consent').style.display = 'flex';
      btn.disabled = false;
      setStatus('Error: gagal/terlalu lama memuat. Periksa izin kamera, internet, '
        + 'HTTPS, dan Console.', 'error');
    }
  });
}
