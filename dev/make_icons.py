"""Draws the RelLens icons with no dependencies: the R from the real Republic wordmark, white on a light-to-dark blue gradient."""
import os, re, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
LIGHT, MID, DARK, WHITE = (112, 198, 255), (1, 109, 255), (6, 34, 138), (255, 255, 255)

def blue(px, py):
    """Light blue (top left) through Republic blue to dark blue (bottom right)."""
    t = (px + py) / 64
    a, b, u = (LIGHT, MID, t / .5) if t < .5 else (MID, DARK, (t - .5) / .5)
    return tuple(a[k] + (b[k] - a[k]) * u for k in range(3))
R_PATH = "M12.524 12.561L12.961 17H9.511L9.074 13.021C9.01267 12.469 8.798 12.0243 8.43 11.687C8.07733 11.3343 7.63267 11.158 7.096 11.158H3.968V17H0.495V0.899999H7.28C8.96667 0.899999 10.293 1.36767 11.259 2.303C12.225 3.23833 12.708 4.45733 12.708 5.96C12.708 7.49333 12.0333 8.61267 10.684 9.318C11.7727 10.0693 12.386 11.1503 12.524 12.561ZM3.968 3.775V8.191H7.096C7.84733 8.191 8.41467 7.97633 8.798 7.547C9.18133 7.11767 9.373 6.58867 9.373 5.96C9.373 5.33133 9.18133 4.81 8.798 4.396C8.41467 3.982 7.84733 3.775 7.096 3.775H3.968Z"
SCALE, TX, TY = 1.2, 7.925, 5.26   # places the R in a 32-unit square
RADIUS = 7

def polygons(d):
    """Flatten an absolute M/L/H/V/C/Z path into polygons."""
    out, cur, pt = [], [], (0.0, 0.0)
    for cmd, args in re.findall(r"([MLHVCZ])([^MLHVCZ]*)", d):
        n = [float(v) for v in re.findall(r"-?\d*\.?\d+", args)]
        if cmd == "M":
            cur = [(n[0], n[1])]; pt = cur[0]
        elif cmd == "L":
            pt = (n[0], n[1]); cur.append(pt)
        elif cmd == "H":
            pt = (n[0], pt[1]); cur.append(pt)
        elif cmd == "V":
            pt = (pt[0], n[0]); cur.append(pt)
        elif cmd == "C":
            for i in range(0, len(n), 6):
                p0, p1, p2, p3 = pt, (n[i], n[i+1]), (n[i+2], n[i+3]), (n[i+4], n[i+5])
                for k in range(1, 17):
                    t = k / 16; u = 1 - t
                    cur.append(tuple(u**3*p0[j] + 3*u*u*t*p1[j] + 3*u*t*t*p2[j] + t**3*p3[j] for j in (0, 1)))
                pt = p3
        elif cmd == "Z":
            out.append(cur); cur = []
    return [[(x * SCALE + TX, y * SCALE + TY) for x, y in poly] for poly in out]

POLYS = polygons(R_PATH)

def in_r(px, py):
    inside = False
    for poly in POLYS:                      # even-odd across all sub-paths cuts out the counter
        j = len(poly) - 1
        for i in range(len(poly)):
            (xi, yi), (xj, yj) = poly[i], poly[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside

def in_bg(px, py):
    cx = min(max(px, RADIUS), 32 - RADIUS); cy = min(max(py, RADIUS), 32 - RADIUS)
    return (px - cx) ** 2 + (py - cy) ** 2 <= RADIUS * RADIUS

def make(size, ss=5):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0.0, 0.0, 0.0]; cover = 0
            for sj in range(ss):
                for si in range(ss):
                    px = (i + (si + .5) / ss) * 32 / size; py = (j + (sj + .5) / ss) * 32 / size
                    if in_bg(px, py):
                        c = WHITE if in_r(px, py) else blue(px, py)
                        for k in range(3): acc[k] += c[k]
                        cover += 1
            rgb = [int(round(acc[k] / cover)) if cover else 0 for k in range(3)]
            row += bytes(rgb + [int(round(255 * cover / (ss * ss)))])
        rows.append(bytes(row))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    open(os.path.join(OUT, "icon%d.png" % size), "wb").write(png)

for s in (16, 32, 48, 128):
    make(s)
print("icons written")
