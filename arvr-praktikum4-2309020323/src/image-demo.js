// src/image-demo.js - Demonstrasi 1: image tracking (MindAR + Three.js) - Deadpool mini
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-image-three.prod.js';
import { setStatus, setupStartButton } from './common.js';

const TARGET_SRC = './targets/target-card.mind'; // hasil kompilasi target-card.png
const TARGET_ASPECT = 372 / 674; // tinggi/lebar gambar target (674x372 px)

let foundCount = 0;

// Deadpool mini: tinggi sekitar 0.58 satuan, titik asal (0,0,0) di telapak kaki.
function buildMiniDeadpool() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.8 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  for (const sx of [-1, 1]) {
    // kaki merah + sepatu hitam
    add(new THREE.CylinderGeometry(0.03, 0.032, 0.16, 12), red, sx * 0.04, 0.13, 0);
    add(new THREE.BoxGeometry(0.06, 0.05, 0.09), black, sx * 0.04, 0.025, 0.01);
    // lengan merah + sarung tangan hitam
    add(new THREE.CylinderGeometry(0.022, 0.025, 0.17, 12), red, sx * 0.105, 0.32, 0, 0, 0, sx * 0.25);
    add(new THREE.SphereGeometry(0.03, 12, 12), black, sx * 0.135, 0.235, 0);
  }

  // badan, sabuk hitam, gesper
  add(new THREE.CylinderGeometry(0.07, 0.06, 0.2, 16), red, 0, 0.31, 0);
  add(new THREE.CylinderGeometry(0.063, 0.063, 0.03, 16), black, 0, 0.215, 0);
  add(new THREE.BoxGeometry(0.03, 0.025, 0.012), steel, 0, 0.215, 0.062);

  // kepala
  add(new THREE.SphereGeometry(0.085, 24, 18), red, 0, 0.5, 0);
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(1, 16, 12), black, sx * 0.035, 0.51, 0.074, 0, 0, sx * 0.4)
      .scale.set(0.035, 0.022, 0.012);
    add(new THREE.SphereGeometry(1, 16, 12), white, sx * 0.035, 0.51, 0.082, 0, 0, sx * 0.4)
      .scale.set(0.016, 0.008, 0.006);
  }

  // dua katana menyilang di punggung
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.012, 0.42, 0.012), steel, 0, 0.36, -0.075, 0, 0, sz * 0.6);
  }

  g.scale.setScalar(0.8);
  g.position.set(0, -0.22, 0.12); // berdiri di bagian bawah target
  return g;
}

async function start() {
  const mindarThree = new MindARThree({
    container: document.getElementById('container'),
    imageTargetSrc: TARGET_SRC,
  });
  const { renderer, scene, camera } = mindarThree;

  // Anchor 0 = target pertama di file .mind. Lebar target = 1 satuan, pusat target = (0,0,0).
  const anchor = mindarThree.addAnchor(0);

  // Bingkai tipis seukuran target: membantu menilai kecocokan posisi dan skala.
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, TARGET_ASPECT)),
    new THREE.LineBasicMaterial({ color: 0x14b8a6 })
  );
  anchor.group.add(frame);

  const deadpool = buildMiniDeadpool();
  anchor.group.add(deadpool);

  // Cahaya (MeshStandardMaterial butuh cahaya agar terlihat).
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(0.5, 1, 1);
  scene.add(dir);

  // Event siklus hidup target.
  anchor.onTargetFound = () => {
    foundCount++;
    setStatus('Target terdeteksi', 'found');
    document.getElementById('info').textContent = 'Target ditemukan ' + foundCount + ' kali.';
  };
  anchor.onTargetLost = () => {
    setStatus('Target hilang - mencari target', 'searching');
  };

  await mindarThree.start(); // minta kamera, muat .mind, mulai tracking
  setStatus('Mencari target', 'searching');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    deadpool.rotation.y = Math.sin(t * 1.2) * 0.6; // menoleh kiri-kanan
    deadpool.position.y = -0.22 + Math.abs(Math.sin(t * 2.4)) * 0.03; // melompat kecil
    renderer.render(scene, camera);
  });
}

setupStartButton(start);
