#!/usr/bin/env python3
"""v0.59 build a first-person gun sheet (6x6 frames of 360x240, the layout in gun_frames.json / GF in index.html) from one
picture holding two poses side by side on a plain background: hip on the left half, aiming down sights on the right half.
The background is flood-filled away from the edges. Usage: make_gun_sheet.py in.jpg out.png [hipHeight] [adsHeight] [hipTurn: degrees anticlockwise, or 'mirror' to flip art whose muzzle leans right]"""
import sys, math
from PIL import Image, ImageDraw

def key(im, tol=26):
    im = im.convert('RGBA'); w, h = im.size; px = im.load(); bg = px[2, 2]
    seen = bytearray(w * h); st = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    near = lambda c: abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol
    while st:
        x, y = st.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]: continue
        seen[y * w + x] = 1; c = px[x, y]
        if not near(c): continue
        px[x, y] = (0, 0, 0, 0); st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im

def part(im, box, hgt):
    p = key(im.crop(box)); bb = p.split()[3].point(lambda a: 255 if a > 40 else 0).getbbox(); p = p.crop(bb)
    s = hgt / p.size[1]; return p.resize((max(1, round(p.size[0] * s)), hgt), Image.LANCZOS)

def main():
    src, out = sys.argv[1], sys.argv[2]; hh = int(sys.argv[3]) if len(sys.argv) > 3 else 150; ah = int(sys.argv[4]) if len(sys.argv) > 4 else 140
    im = Image.open(src).convert('RGB'); W, H = im.size; m = W // 2
    arg = sys.argv[5] if len(sys.argv) > 5 else '0'; mirror = arg == 'mirror'; turn = 0 if mirror else float(arg)
    hip = part(im, (0, 0, m - 6, H), hh); ads = part(im, (m + 6, 0, W, H), ah)
    if mirror: hip = hip.transpose(Image.FLIP_LEFT_RIGHT); ads = ads.transpose(Image.FLIP_LEFT_RIGHT)
    if turn:
        hip = hip.rotate(turn, resample=Image.BICUBIC, expand=True); bb = hip.split()[3].getbbox(); hip = hip.crop(bb)
        s = hh / hip.size[1]; hip = hip.resize((round(hip.size[0] * s), hh), Image.LANCZOS)
    FW, FH = 360, 240; sheet = Image.new('RGBA', (FW * 6, FH * 6), (0, 0, 0, 0))
    def put(f, img, x, y, rot=0):
        if rot: img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
        fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); fr.alpha_composite(img, (int(x), int(y))) if 0 <= x and 0 <= y and x + img.size[0] <= FW and y + img.size[1] <= FH else fr.paste(img, (int(x), int(y)), img)
        sheet.paste(fr, ((f % 6) * FW, (f // 6) * FH))
    hx, hy = FW - hip.size[0] - 14, FH - hip.size[1] + 22          # hip: bottom-right, hands just off the bottom edge
    ax, ay = (FW - ads.size[0]) // 2, FH - ads.size[1] + 12        # aiming: centred, sight near the middle (index.html lowers it to the dot)
    put(0, hip, hx, hy)
    for i, (dx, dy) in enumerate([(4, 6), (3, 4), (1, 2), (0, 1)]): put(1 + i, hip, hx + dx, hy + dy)
    for i in range(16):                                            # reload: dip the gun out of view and bring it back
        t = i / 15; d = math.sin(t * math.pi); put(5 + i, hip, hx + 18 * d, hy + 70 * d, rot=-12 * d)
    put(21, ads, ax, ay)
    for i, dy in enumerate([5, 3, 2, 1]): put(22 + i, ads, ax, ay + dy)
    put(26, hip, hx + 24, hy + 34, rot=-22)                        # sprint: carried low and canted
    for i, k in enumerate([.3, .7, 1, .6, .25]): put(27 + i, hip, hx - 40 * k, hy - 18 * k, rot=8 * k)   # bayonet / butt stroke
    sheet.save(out, optimize=True)

if __name__ == '__main__': main()
