// src/face-demo.js - Demonstrasi 2: face tracking (MindAR + Three.js) - topeng Deadpool dari gambar PNG
// Topeng terdiri dari dua lapis:
//  1) Cangkang kaku (silinder melengkung) di belakang: menutupi seluruh kepala (ubun-ubun, sisi).
//  2) Face mesh MindAR di depan: gambar topeng sebagai tekstur pada 468 titik wajah, sehingga
//     mata, alis, mulut, dan rahang ikut berubah bentuk sesuai ekspresi.
// Satuan di bawah ini cm pada model wajah MindAR (jarak antar pusat mata sekitar 6,33 cm).
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-face-three.prod.js';
import { setStatus, setupStartButton } from './common.js';
import { FACE_XY } from './face-canonical.js';

const MASK_TEXTURE_SRC = './assets/images/deadpool-mask.png';   // 749 x 1100 px
const IMG_W = 749;
const IMG_H = 1100;

// ===== Konstanta yang boleh diubah saat menyetel (ubah satu per percobaan) =====
const SHELL_WIDTH = 17;          // lebar topeng (cm). Lebih besar = topeng lebih lebar
const CURVE_RADIUS = 8;            // kelengkungan: kecil = makin melengkung, besar = makin datar
const SHELL_EYE_V = 0.514;         // posisi mata pada gambar, dari atas (0 = atas, 1 = bawah)
const HEAD_CENTER_Z = -3.5;        // pusat kepala pada sumbu depan-belakang (cm)
const FACE_EYE_Y = 2.627;          // tinggi titik tengah kedua mata pada model wajah (cm)
const MIRROR_TEXTURE = false;      // true jika gambar topeng terlihat terbalik kiri-kanan
const PAD = 48;                    // pinggiran transparan di sekeliling gambar (piksel)

const SHELL_ASPECT = IMG_H / IMG_W;

// Memuat gambar untuk cangkang (silinder).
function loadShellTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    }, undefined, () => reject(new Error('Gagal memuat ' + url)));
  });
}

// Memuat gambar untuk face mesh, ditempatkan pada kanvas dengan pinggiran transparan.
function loadMeshTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width + 2 * PAD;
      canvas.height = img.height + 2 * PAD;
      canvas.getContext('2d').drawImage(img, PAD, PAD);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve({ tex, w: canvas.width, h: canvas.height });
    };
    img.onerror = () => reject(new Error('Gagal memuat ' + url));
    img.src = url;
  });
}

// Cangkang kaku: setengah silinder yang menutupi seluruh kepala.
function buildShell(texture) {
  const height = SHELL_WIDTH * SHELL_ASPECT;
  const arc = SHELL_WIDTH / CURVE_RADIUS; // sudut busur (radian) agar panjang busur = lebar topeng
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(CURVE_RADIUS, CURVE_RADIUS, height, 48, 1, true, -arc / 2, arc),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      toneMapped: false,
      depthTest: false,   // selalu digambar duluan
      depthWrite: false   // tidak menutupi mesh wajah yang posisinya lebih ke belakang
    })
  );
  // Mata pada gambar dibuat sejajar dengan tinggi mata pada model wajah.
  shell.position.set(0, FACE_EYE_Y + (SHELL_EYE_V - 0.5) * height, HEAD_CENTER_Z);
  shell.renderOrder = 0;
  return shell;
}

// Menghitung koordinat tekstur (UV) tiap titik wajah dari posisi netralnya (FACE_XY).
// Pemetaannya sama dengan cangkang (silinder), sehingga gambar keduanya menyambung.
function buildUVs(w, h) {
  const pxPerCm = IMG_W / SHELL_WIDTH;
  const uvs = new Float32Array(FACE_XY.length * 2);
  FACE_XY.forEach(([x, y], i) => {
    // x dilengkungkan seperti silinder cangkang
    const s = CURVE_RADIUS * Math.asin(Math.max(-1, Math.min(1, x / CURVE_RADIUS)));
    const px = IMG_W / 2 + s * pxPerCm;
    const py = SHELL_EYE_V * IMG_H - (y - FACE_EYE_Y) * pxPerCm;
    const u = (px + PAD) / w;
    uvs[i * 2] = MIRROR_TEXTURE ? 1 - u : u;
    uvs[i * 2 + 1] = 1 - (py + PAD) / h;   // v di Three.js dihitung dari bawah
  });
  return uvs;
}

async function start() {
  const mindarThree = new MindARThree({ container: document.getElementById('container') });
  const { renderer, scene, camera } = mindarThree;

  // Face mesh = "kulit" wajah yang jaringnya diperbarui MindAR tiap frame, jadi bentuknya
  // mengikuti ekspresi. Topeng adalah tekstur pada mesh ini; otomatis hilang saat wajah hilang.
  const faceMesh = mindarThree.addFaceMesh();
  scene.add(faceMesh);

  const { tex, w, h } = await loadMeshTexture(MASK_TEXTURE_SRC);
  faceMesh.geometry.getAttribute('uv').array.set(buildUVs(w, h));
  faceMesh.geometry.getAttribute('uv').needsUpdate = true;
  faceMesh.material = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false
  });
  faceMesh.renderOrder = 1;   // digambar setelah cangkang, jadi berada di depannya

  // Cangkang kaku menjadi anak face mesh: ikut posisi, rotasi, dan ukuran wajah.
  const shellTex = await loadShellTexture(MASK_TEXTURE_SRC);
  faceMesh.add(buildShell(shellTex));

  await mindarThree.start(); // minta kamera depan, memuat model deteksi wajah
  setStatus('Mencari wajah', 'searching');

  let hadFace = false, lostCount = 0;
  renderer.setAnimationLoop(() => {
    // Anchor wajah tidak punya event found/lost; gunakan getLatestEstimate():
    // bernilai null jika tidak ada wajah pada frame terakhir.
    const hasFace = mindarThree.getLatestEstimate() !== null;
    if (hasFace !== hadFace) {
      hadFace = hasFace;
      if (hasFace) setStatus('Wajah terdeteksi', 'found');
      else { lostCount++; setStatus('Wajah tidak terdeteksi - mencari wajah', 'searching'); }
      document.getElementById('info').textContent = 'Wajah hilang ' + lostCount + ' kali.';
    }
    renderer.render(scene, camera);
  });
}

setupStartButton(start);