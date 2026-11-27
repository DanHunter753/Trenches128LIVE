"""v0.41 climbing hands from the owner's picture build/ref/climb_hands.jpg (two hands and sleeves on a brick ledge).
Cuts each arm out of the wall with GrabCut (seeded by a rough outline) and writes public/assets/climb_hands.png:
two 360x240 layers side by side, 0 = left arm, 1 = right arm. The game moves them (hand over hand, then the push-up).
Run: python3 build/fpv_climb.py"""
import os, numpy as np, cv2
from PIL import Image
HERE = os.path.dirname(__file__); SRC = os.path.join(HERE, 'ref', 'climb_hands.jpg'); OUT = os.path.join(HERE, '..', 'public', 'assets', 'climb_hands.png')
im = cv2.imread(SRC); H, W = im.shape[:2]
P = {'L': [(335,300),(345,230),(400,196),(500,205),(548,262),(540,320),(480,380),(455,420),(440,520),(380,650),(330,780),(300,816),(40,816),(130,690),(250,490),(330,420),(325,380)],
     'R': [(865,440),(905,365),(985,343),(1060,368),(1090,440),(1095,590),(1100,610),(1180,690),(1290,816),(1030,816),(985,690),(995,620),(950,600),(890,500)]}
Z = {'L': (320, 560, 190, 440), 'R': (860, 1100, 335, 540)}   # hand zones: brick chunks left between the fingers are removed here
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB); layers = []
for k, pts in P.items():
    poly = np.zeros((H, W), np.uint8); cv2.fillPoly(poly, [np.array(pts)], 255)
    dil = cv2.dilate(poly, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))); ero = cv2.erode(poly, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
    m = np.full((H, W), cv2.GC_BGD, np.uint8); m[dil > 0] = cv2.GC_PR_BGD; m[poly > 0] = cv2.GC_PR_FGD; m[ero > 0] = cv2.GC_FGD
    cv2.grabCut(im, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg); fg = ((lab == 1 + np.argmax(st[1:, 4])) * 255).astype(np.uint8)
    x0, x1, y0, y1 = Z[k]; a = rgb.astype(np.float32) / 255; mx = a.max(2); sat = (mx - a.min(2)) / np.maximum(mx, 1e-3)
    brick = (mx < .3) & (sat < .34); zone = np.zeros((H, W), bool); zone[y0:y1, x0:x1] = True
    fg[brick & zone] = 0; fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg); fg = ((lab == 1 + np.argmax(st[1:, 4])) * 255).astype(np.uint8)
    inv = 255 - fg; n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for i in range(1, n):
        if st[i, 4] < 4000: fg[lab == i] = 255
    rgba = np.dstack([rgb, cv2.GaussianBlur(fg, (0, 0), 1.0)]); s = 360 / W
    big = cv2.resize(rgba, (360, round(H * s)), interpolation=cv2.INTER_AREA); fr = np.zeros((240, 360, 4), np.uint8); fr[240 - big.shape[0]:] = big
    layers.append(fr)
Image.fromarray(np.concatenate(layers, 1)).save(OUT, optimize=True); print(OUT, os.path.getsize(OUT))
