"""Membuat tekstur UV topeng Deadpool untuk face mesh MindAR.

Gambar topeng (tampak depan) diproyeksikan ke 468 titik wajah kanonik, lalu
"dibuka" ke ruang UV. Hasil: assets/images/deadpool-face-texture.png

Pakai:  pip install pillow numpy scipy
        python tools/make_mask_texture.py [ZOOM] [SHIFT_Y_CM]
ZOOM    >1 topeng lebih besar di wajah, <1 lebih kecil (default 1.0)
SHIFT_Y topeng digeser ke atas (+) / bawah (-) dalam cm (default 0.0)
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ZOOM = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
SHIFT_Y = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
SRC = 'assets/images/deadpool-mask.png'
OUT = 'assets/images/deadpool-face-texture.png'
N = 1024
RED = (216, 44, 60)

d = json.load(open('tools/face-mesh-data.json'))
V = np.array(d['verts']); UV = np.array(d['uvs']); IDX = np.array(d['idx']).reshape(-1, 3)

# --- gambar topeng di atas latar merah (agar tidak ada bagian transparan) ---
mask = Image.open(SRC).convert('RGBA')
W = 1000; H = round(mask.height * W / mask.width)
mask = mask.resize((W, H), Image.LANCZOS)
bg = Image.new('RGBA', mask.size, RED + (255,)); bg.alpha_composite(mask)
img = np.array(bg.convert('RGB')).astype(np.float32)

# --- pusat kedua lubang mata putih pada gambar (komponen putih terbesar di pita mata) ---
white = (img.min(axis=2) > 245)
band = np.zeros_like(white); band[int(H*.42):int(H*.60), :] = True
lab, n = ndimage.label(white & band)
sizes = ndimage.sum(white & band, lab, range(1, n+1))
top2 = np.argsort(sizes)[-2:] + 1
cents = sorted([ndimage.center_of_mass(lab == k) for k in top2], key=lambda c: c[1])  # (y, x)
(eyeL_y, eyeL_x), (eyeR_y, eyeR_x) = cents
img_eye_dist = eyeR_x - eyeL_x
img_eye_mid = ((eyeL_x + eyeR_x) / 2, (eyeL_y + eyeR_y) / 2)

# --- pusat mata pada wajah kanonik (cm) ---
c_eye_L = (V[33] + V[133]) / 2; c_eye_R = (V[263] + V[362]) / 2
can_eye_dist = abs(c_eye_R[0] - c_eye_L[0])
can_mid = (c_eye_L + c_eye_R) / 2
s = img_eye_dist / can_eye_dist * ZOOM            # piksel gambar per cm
print(f'jarak mata gambar={img_eye_dist:.0f}px, wajah={can_eye_dist:.2f}cm, skala={s:.1f}px/cm')

def src_xy(v):   # titik kanonik (cm) -> piksel gambar topeng
    return img_eye_mid[0] + s * (v[0] - can_mid[0]), img_eye_mid[1] - s * (v[1] - can_mid[1] - SHIFT_Y)

def sample(x, y):   # bilinear, tepi dijepit
    x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = x.astype(int); y0 = y.astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0]*(1-fx)*(1-fy) + img[y0, x0+1]*fx*(1-fy) +
            img[y0+1, x0]*(1-fx)*fy + img[y0+1, x0+1]*fx*fy)

tex = np.zeros((N, N, 3), np.float32); tex[:] = RED
SP = [src_xy(v) for v in V]
for tri in IDX:
    P = np.array([[UV[i][0]*N, (1-UV[i][1])*N] for i in tri])   # piksel UV (baris 0 = atas)
    S = np.array([SP[i] for i in tri])
    x0, y0 = np.floor(P.min(0)).astype(int) - 1; x1, y1 = np.ceil(P.max(0)).astype(int) + 1
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, N-1), min(y1, N-1)
    if x1 < x0 or y1 < y0: continue
    gx, gy = np.meshgrid(np.arange(x0, x1+1) + .5, np.arange(y0, y1+1) + .5)
    a, b, c = P
    den = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
    if abs(den) < 1e-9: continue
    w0 = ((b[1]-c[1])*(gx-c[0]) + (c[0]-b[0])*(gy-c[1])) / den
    w1 = ((c[1]-a[1])*(gx-c[0]) + (a[0]-c[0])*(gy-c[1])) / den
    w2 = 1 - w0 - w1
    eps = -0.02
    m = (w0 > eps) & (w1 > eps) & (w2 > eps)
    sx = w0*S[0][0] + w1*S[1][0] + w2*S[2][0]; sy = w0*S[0][1] + w1*S[1][1] + w2*S[2][1]
    col = sample(sx, sy)
    tex[y0:y1+1, x0:x1+1][m] = col[m]

Image.fromarray(tex.clip(0, 255).astype(np.uint8)).save(OUT, optimize=True)
print('tersimpan', OUT)

# --- pratinjau: tampak depan wajah bertekstur (untuk pengecekan visual) ---
if '--preview' in sys.argv:
    PW, PH = 700, 900; pv = np.full((PH, PW, 3), 40, np.float32); sc = 38
    T = np.array(Image.open(OUT).convert('RGB')).astype(np.float32)
    order = np.argsort(np.array([V[t][:, 2].mean() for t in IDX]))
    for ti in order:
        tri = IDX[ti]
        P = np.array([[PW/2 + sc*V[i][0], 330 - sc*V[i][1]] for i in tri])
        Q = np.array([[UV[i][0]*N, (1-UV[i][1])*N] for i in tri])
        x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int)
        gx, gy = np.meshgrid(np.arange(x0, x1+1)+.5, np.arange(y0, y1+1)+.5)
        a, b, c = P; den = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
        if abs(den) < 1e-9: continue
        w0 = ((b[1]-c[1])*(gx-c[0]) + (c[0]-b[0])*(gy-c[1]))/den
        w1 = ((c[1]-a[1])*(gx-c[0]) + (a[0]-c[0])*(gy-c[1]))/den; w2 = 1-w0-w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        u = (w0*Q[0][0]+w1*Q[1][0]+w2*Q[2][0]).clip(0, N-1).astype(int)
        v = (w0*Q[0][1]+w1*Q[1][1]+w2*Q[2][1]).clip(0, N-1).astype(int)
        gxi = gx.astype(int).clip(0, PW-1); gyi = gy.astype(int).clip(0, PH-1)
        sel = pv[gyi, gxi]; sel[m] = T[v, u][m]; pv[gyi, gxi] = sel
    Image.fromarray(pv.astype(np.uint8)).save('/tmp/fm/preview.png'); print('pratinjau /tmp/fm/preview.png')
