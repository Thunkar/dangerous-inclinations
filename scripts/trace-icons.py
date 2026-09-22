"""Trace `ui/public/assets/icons/*.png` into the SVG paths the UI draws.

The PNGs are the artwork. They are raster, several sizes, and flattened to a
silhouette by a CSS filter, which is fine on a dark screen and no good at all
on a printed card: a filter cannot make one of them black, and a 400px bitmap
scaled to 6mm is not what you want on paper. So they are traced once, here,
into `ui/src/art/paths.ts`, which is generated and checked in.

    magick                one pipeline per polarity, read back as a PGM
    boundary edges        one per filled pixel side facing emptiness, wound
                          so the fill is on the right (nonzero does the holes)
    Ramer-Douglas-Peucker drops the points that carry no shape
    quadratics            through the midpoints, except where the turn is
                          sharp enough to be a corner and stays one

Run it after changing any icon:

    python3 scripts/trace-icons.py --write

The tolerance is in source pixels at SIZE; 2.5 is the point where the traces
stop being distinguishable from the bitmaps at 16px and at 90px.
"""
import pathlib
import subprocess, sys, math

SIZE = 160          # trace resolution; the path is scaled to 64 at the end
VIEW = 64.0

def _pgm(args):
    """Run one ImageMagick pipeline and read its PGM back as 0/1 pixels.

    The maxval is read rather than assumed: a bilevel source comes back with
    a maxval of 1, and testing those bytes against 127 sees an empty image.
    """
    out = subprocess.run(['magick'] + args + ['-depth', '8', 'pgm:-'],
                         capture_output=True, check=True).stdout
    head, dims, maxval, data = out.split(b'\n', 3)
    assert head.strip() == b'P5', head
    w, h = map(int, dims.split())
    cut = int(maxval) / 2.0
    return [[1 if data[y * w + x] > cut else 0 for x in range(w)] for y in range(h)], w, h

def bitmap(path):
    """The icon as a filled/empty grid.

    Most of these PNGs carry the shape in their alpha channel, but not all:
    a couple are opaque rectangles with the shape in the ink. So take the
    alpha first and fall back to luminance when the alpha says the whole
    square is solid, picking whichever polarity gives a plausible icon.

    A non-square icon is padded to the square, and the padding has to be
    empty in the branch that reads it: transparent for the alpha, and the
    flattening colour for luminance, since a flattened image has no alpha
    left and `none` there comes back black, which one polarity reads as ink.
    """
    def box(background):
        return ['-background', background, '-resize', f'{SIZE}x{SIZE}',
                '-gravity', 'center', '-extent', f'{SIZE}x{SIZE}']
    candidates = [
        _pgm([path] + box('none') + ['-alpha', 'extract', '-threshold', '45%']),
        _pgm([path, '-background', 'white', '-flatten'] + box('white')
             + ['-negate', '-threshold', '45%']),
        _pgm([path, '-background', 'black', '-flatten'] + box('black')
             + ['-threshold', '45%']),
    ]
    for px, w, h in candidates:
        ratio = sum(map(sum, px)) / float(w * h)
        if 0.02 < ratio < 0.60:
            return px, w, h
    return candidates[0]

def contours(px, w, h):
    """Every closed boundary between filled and empty, as a point loop.

    One directed edge per filled pixel side that faces emptiness, always
    oriented with the fill on its right. Outer boundaries then come out
    clockwise and holes counter-clockwise, which is exactly what SVG's
    default nonzero rule wants: no fill-rule to set and no hole to guess.
    """
    def f(x, y):
        return px[y][x] if 0 <= x < w and 0 <= y < h else 0

    out = {}
    def edge(a, b):
        out.setdefault(a, []).append(b)

    for y in range(h):
        for x in range(w):
            if not f(x, y):
                continue
            if not f(x, y - 1): edge((x, y), (x + 1, y))
            if not f(x + 1, y): edge((x + 1, y), (x + 1, y + 1))
            if not f(x, y + 1): edge((x + 1, y + 1), (x, y + 1))
            if not f(x - 1, y): edge((x, y + 1), (x, y))

    loops = []
    while out:
        start = next(iter(out))
        loop = [start]
        node = start
        while True:
            nexts = out.get(node)
            if not nexts:
                break
            nxt = nexts.pop()
            if not nexts:
                del out[node]
            if nxt == start:
                break
            loop.append(nxt)
            node = nxt
        if len(loop) > 8:
            loops.append(loop)
    return loops

def rdp(points, eps):
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    norm = math.hypot(dx, dy) or 1.0
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px_, py_ = points[i]
        d = abs(dy * (px_ - ax) - dx * (py_ - ay)) / norm
        if d > worst:
            worst, index = d, i
    if worst <= eps:
        return [points[0], points[-1]]
    return rdp(points[:index + 1], eps)[:-1] + rdp(points[index:], eps)

def smooth_path(points, scale, corner_deg=62):
    """Quadratics through the midpoints, with real corners kept sharp."""
    n = len(points)
    pts = [(x * scale, y * scale) for x, y in points]

    def angle_at(i):
        ax, ay = pts[(i - 1) % n]
        bx, by = pts[i]
        cx, cy = pts[(i + 1) % n]
        v1 = (bx - ax, by - ay)
        v2 = (cx - bx, cy - by)
        n1 = math.hypot(*v1) or 1e-9
        n2 = math.hypot(*v2) or 1e-9
        cos = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
        return math.degrees(math.acos(cos))

    sharp = [angle_at(i) > corner_deg for i in range(n)]
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    def fmt(p):
        return f'{round(p[0], 1):g} {round(p[1], 1):g}'

    start = mid(pts[-1], pts[0])
    out = [f'M{fmt(start)}']
    for i in range(n):
        p = pts[i]
        nxt = mid(p, pts[(i + 1) % n])
        if sharp[i]:
            out.append(f'L{fmt(p)}')
            out.append(f'L{fmt(nxt)}')
        else:
            out.append(f'Q{fmt(p)} {fmt(nxt)}')
    out.append('Z')
    return ''.join(out)

def trace(path, eps=2.5):
    px, w, h = bitmap(path)
    scale = VIEW / w
    loops = contours(px, w, h)
    loops.sort(key=len, reverse=True)
    ds = []
    for loop in loops:
        simple = rdp(loop, eps)
        if len(simple) > 2 and simple[0] == simple[-1]:
            simple = simple[:-1]
        if len(simple) < 3:
            continue
        ds.append(smooth_path(simple, scale))
    return ''.join(ds)

ICON_DIR = pathlib.Path(__file__).resolve().parent.parent / 'ui/public/assets/icons'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'ui/src/art/paths.ts'

HEADER = """/**
 * Icon outlines, traced from the PNGs in `public/assets/icons`.
 *
 * GENERATED by `scripts/trace-icons.py`; do not edit by hand. The PNGs remain
 * the artwork, and this is the vector of them: one filled path per icon on a
 * 64x64 box, carrying no colour of its own, so the same mark is bone white on
 * the board and black ink on a printed card.
 */
export const TRACED_PATHS = {
"""


def main():
    sys.setrecursionlimit(20000)
    write = '--write' in sys.argv
    names = sorted(p.stem for p in ICON_DIR.glob('*.png'))
    rows = []
    for name in names:
        d = trace(ICON_DIR / f'{name}.png')
        rows.append((name, d))
        print(f'{name:24} {len(d):6} chars', file=sys.stderr)
    body = ''.join(f"  {name.replace('-', '_')}: '{d}',\n" for name, d in rows)
    text = HEADER + body + '} as const satisfies Record<string, string>\n'
    if write:
        OUT.write_text(text)
        print(f'wrote {OUT} ({len(text)} bytes)', file=sys.stderr)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
