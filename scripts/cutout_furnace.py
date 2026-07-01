# -*- coding: utf-8 -*-
"""
丹炉 PNG 抠图：抠除烘焙进图片的棋盘格透明背景（白 255 + 浅灰 219 及其抗锯齿过渡）。
策略：
  1) 从图像四边向内 BFS 漫水填充，仅抹除"连通到边缘"的亮灰像素（棋盘格），
     这样不会误伤丹炉内部任何封闭的亮色高光；
  2) 对丹炉边界做 1 轮羽化：紧邻透明区且仍偏亮的像素按亮度渐变半透明，消除白边锯齿。
原图备份为 furnace_orig.png。处理 server（实际被服务）与 web public 两份。
"""
from PIL import Image
from collections import deque
import os, shutil, io

paths = [
    r'D:\text\icarus-models\dqdl\dqdl-server\public\image\furnace.png',
    r'D:\text\icarus-models\dqdl\dqdl-web\public\image\furnace.png',
]
out = []


def is_bg(r, g, b):
    """棋盘格背景：亮（min>=205）且近灰（通道差<=25）。"""
    mn, mx = min(r, g, b), max(r, g, b)
    return mn >= 205 and (mx - mn) <= 25


def process(p):
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    px = im.load()

    # 1) BFS 从四边漫水，抹除连通的棋盘格背景
    visited = bytearray(w * h)
    dq = deque()

    def try_enq(x, y):
        if 0 <= x < w and 0 <= y < h and not visited[y * w + x]:
            r, g, b, a = px[x, y]
            if is_bg(r, g, b):
                visited[y * w + x] = 1
                dq.append((x, y))

    for x in range(w):
        try_enq(x, 0); try_enq(x, h - 1)
    for y in range(h):
        try_enq(0, y); try_enq(w - 1, y)
    while dq:
        x, y = dq.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)           # 抹除为全透明
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            try_enq(nx, ny)

    # 2) 边缘羽化：紧邻透明像素、且仍偏亮的丹炉边界像素按亮度做半透明，去白边
    edge = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            nb_trans = False
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if not (0 <= nx < w and 0 <= ny < h) or px[nx, ny][3] == 0:
                    nb_trans = True
                    break
            if nb_trans:
                edge.append((x, y))
    for x, y in edge:
        r, g, b, a = px[x, y]
        mn = min(r, g, b)
        if mn >= 165:                      # 偏亮的边界=残留抗锯齿白边
            f = (mn - 165) / 40.0          # 165→0，205→1
            f = 0.0 if f < 0 else (1.0 if f > 1 else f)
            px[x, y] = (r, g, b, int(a * (1 - f)))

    transparent = sum(1 for y in range(h) for x in range(w) if px[x, y][3] == 0)
    im.save(p, 'PNG')
    return (w, h, transparent, w * h)


for p in paths:
    if not os.path.exists(p):
        out.append(f'跳过(不存在): {p}')
        continue
    bak = p.replace('.png', '_orig.png')
    if not os.path.exists(bak):
        shutil.copy(p, bak)
        out.append(f'已备份原图: {bak}')
    w, h, t, total = process(p)
    out.append(f'已处理: {p}\n  尺寸 {w}x{h}  透明 {t}/{total} ({t*100//total}%)')

with io.open(r'C:\Users\ZHOUWE~1\AppData\Local\Temp\opencode\cutout.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done')
