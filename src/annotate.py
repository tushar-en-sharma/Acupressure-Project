#!/usr/bin/env python3
"""
annotate.py — Human-in-the-loop 64-point acupressure annotator.
================================================================
This is the tool that *improves model accuracy*. Instead of labelling from a
blank image, every point is pre-placed for you:

    * points 0-20  -> MediaPipe (exact, locked, shown small & grey)
    * points 21-63 -> predicted by the current geometry model (draggable)

You only nudge the points that are wrong, then press 's' to save. Each image
you correct becomes new ground truth; re-running `train.py` refits the model on
the larger, better set, so accuracy rises with every annotation session. It is
also the ONLY way to create ground truth for palm points 51-63, which the
original 50-image dataset never had.

Run:
    python src/annotate.py                 # start / resume
    python src/annotate.py --only-acu      # jump straight to the 7 acu-points
    python src/annotate.py --start 200     # start at image #200

Controls (also shown on-screen, toggle with 'h'):
    left-drag / click ....... move the selected point
    Tab / [ / ] ............. cycle selected point
    arrow keys .............. nudge selected point by 1px (fine control)
    a ....................... jump selection to next acupressure point
    n / p ................... next / previous image  (auto-saves)
    s ....................... save this image
    r ....................... re-seed all points from the model
    f ....................... flip which face (palm/back) is assumed
    d ....................... delete/skip this image (no hand / bad)
    h ....................... toggle help overlay
    q / Esc ................. save & quit
"""

from __future__ import annotations

import argparse
import os
import sys
import tkinter as tk
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image, ImageTk

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

# Point groups for colour-coding and locking
BASE      = set(range(0, 21))                       # locked, from MediaPipe
CUSTOM    = set(range(21, 51))                       # learned finger points
PALM      = set(range(51, 64))                       # palm / acupressure support
ACU_IDX   = {27, 32, 34, 37, 59, 62, 63}             # the 5 mapped conditions (both sides)

ACU_LABEL = {
    27: "Lu5 (R)", 32: "Lu5 (L)", 34: "BL60 (R)", 37: "BL60 (L)",
    59: "GV1", 62: "CV8", 63: "CV4",
}

COL_BASE   = "#8a8a8a"
COL_CUSTOM = "#22d3ee"
COL_PALM   = "#f59e0b"
COL_ACU    = "#ec4899"
COL_SEL    = "#22c55e"


class Annotator:
    def __init__(self, start=None, only_acu=False):
        self.only_acu = only_acu
        self.point_defs = C.load_point_defs()
        self.images = sorted(
            f for f in os.listdir(C.IMAGES_DIR)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        )
        if not self.images:
            sys.exit(f"No images found in {C.IMAGES_DIR}")

        # Load existing ground truth (resume-friendly)
        if C.GT_CSV.exists():
            self.df = pd.read_csv(C.GT_CSV)
        else:
            self.df = pd.DataFrame(columns=C.CSV_COLUMNS)
        self.annotated = set(self.df["filename"].unique())

        self.hands = C.make_hands(static=True, max_hands=1, det_conf=0.4)

        self.idx = start if start is not None else self._first_unannotated()
        self.pts = None            # (64,2) normalised
        self.side = "Right"
        self.facing = "palm"
        self.selected = 21
        self.show_help = True
        self.dragging = False

        self._build_gui()
        self._load(self.idx)
        self.root.mainloop()

    # ── data helpers ─────────────────────────────────────────────────────────
    def _first_unannotated(self):
        for i, f in enumerate(self.images):
            if f not in self.annotated:
                return i
        return 0

    def _seed_points(self, pts_21):
        """Full 64-point seed from MediaPipe + current model."""
        return C.predict_64(pts_21, self.point_defs)

    def _load(self, idx):
        self.idx = idx % len(self.images)
        fname = self.images[self.idx]
        img = cv2.imread(str(C.IMAGES_DIR / fname))
        if img is None:
            self._toast(f"Cannot read {fname} — skipping")
            self.root.after(300, lambda: self._load(self.idx + 1))
            return
        self.cv_img = img
        self.ih, self.iw = img.shape[:2]

        pts_21, side = C.mediapipe_21(img, self.hands)
        self.has_hand = pts_21 is not None
        if self.has_hand:
            self.side = side
            self.facing = C.hand_facing(pts_21, side)

        # Prefer saved annotation; else seed from model.
        rows = self.df[self.df["filename"] == fname]
        if len(rows) >= 51:
            pts = np.zeros((C.N_TOTAL, 2), np.float32)
            for _, r in rows.iterrows():
                j = int(r["point_index"])
                if 0 <= j < C.N_TOTAL:
                    pts[j] = [r["x_norm"], r["y_norm"]]
            # backfill any missing palm points from the model seed
            if self.has_hand and len(rows) < C.N_TOTAL:
                seed = self._seed_points(pts_21)
                present = set(rows["point_index"].astype(int))
                for j in range(C.N_TOTAL):
                    if j not in present:
                        pts[j] = seed[j]
            self.pts = pts
        elif self.has_hand:
            self.pts = self._seed_points(pts_21)
        else:
            self.pts = None

        if self.only_acu and self.has_hand:
            self.selected = min(ACU_IDX)
        self._render()

    def _save(self):
        if self.pts is None:
            return
        fname = self.images[self.idx]
        self.df = self.df[self.df["filename"] != fname]
        rows = []
        for j in range(C.N_TOTAL):
            src = "mediapipe" if j < 21 else "custom"
            rows.append([fname, j, float(self.pts[j][0]), float(self.pts[j][1]), src])
        self.df = pd.concat(
            [self.df, pd.DataFrame(rows, columns=C.CSV_COLUMNS)], ignore_index=True)
        C.GT_CSV.parent.mkdir(parents=True, exist_ok=True)
        self.df.to_csv(C.GT_CSV, index=False)
        self.annotated.add(fname)

    # ── coordinate transforms (image-normalised <-> canvas px) ───────────────
    def _fit(self):
        cw, ch = self.CW, self.CH
        s = min(cw / self.iw, ch / self.ih)
        dw, dh = int(self.iw * s), int(self.ih * s)
        ox, oy = (cw - dw) // 2, (ch - dh) // 2
        return s, dw, dh, ox, oy

    def _n2c(self, pt):
        s, dw, dh, ox, oy = self._geom
        return ox + pt[0] * dw, oy + pt[1] * dh

    def _c2n(self, x, y):
        s, dw, dh, ox, oy = self._geom
        nx = (x - ox) / dw if dw else 0
        ny = (y - oy) / dh if dh else 0
        return float(np.clip(nx, 0, 1)), float(np.clip(ny, 0, 1))

    # ── GUI ──────────────────────────────────────────────────────────────────
    def _build_gui(self):
        self.CW, self.CH = 1000, 720
        self.root = tk.Tk()
        self.root.title("Acupressure 64-point Annotator")
        self.root.configure(bg="#111827")

        top = tk.Frame(self.root, bg="#1f2937", height=40)
        top.pack(fill=tk.X)
        self.status = tk.Label(top, text="", fg="#e5e7eb", bg="#1f2937",
                               font=("Menlo", 12), anchor="w")
        self.status.pack(side=tk.LEFT, padx=12, pady=8)
        self.prog = tk.Label(top, text="", fg="#22d3ee", bg="#1f2937",
                             font=("Menlo", 12, "bold"))
        self.prog.pack(side=tk.RIGHT, padx=12)

        self.canvas = tk.Canvas(self.root, width=self.CW, height=self.CH,
                                bg="#0b1220", highlightthickness=0)
        self.canvas.pack()
        self.canvas.bind("<Button-1>", self._on_down)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_up)

        self.selbar = tk.Label(self.root, text="", fg="#e5e7eb", bg="#111827",
                               font=("Menlo", 12), anchor="w")
        self.selbar.pack(fill=tk.X, padx=12, pady=4)

        b = self.root.bind
        b("<Key-n>", lambda e: self._next(+1))
        b("<Key-p>", lambda e: self._next(-1))
        b("<Key-s>", lambda e: (self._save(), self._toast("saved")))
        b("<Key-r>", lambda e: self._reseed())
        b("<Key-f>", lambda e: self._flip_face())
        b("<Key-a>", lambda e: self._next_acu())
        b("<Key-d>", lambda e: self._skip())
        b("<Key-h>", lambda e: self._toggle_help())
        b("<Tab>",   lambda e: self._cycle(+1))
        b("<bracketright>", lambda e: self._cycle(+1))
        b("<bracketleft>",  lambda e: self._cycle(-1))
        b("<Up>",    lambda e: self._nudge(0, -1))
        b("<Down>",  lambda e: self._nudge(0, +1))
        b("<Left>",  lambda e: self._nudge(-1, 0))
        b("<Right>", lambda e: self._nudge(+1, 0))
        b("<Key-q>", lambda e: self._quit())
        b("<Escape>", lambda e: self._quit())

    def _render(self):
        self.canvas.delete("all")
        self._geom = self._fit()
        s, dw, dh, ox, oy = self._geom

        disp = cv2.cvtColor(cv2.resize(self.cv_img, (dw, dh)), cv2.COLOR_BGR2RGB)
        self.tkimg = ImageTk.PhotoImage(Image.fromarray(disp))
        self.canvas.create_image(ox, oy, anchor="nw", image=self.tkimg)

        if not self.has_hand or self.pts is None:
            self.canvas.create_text(self.CW // 2, self.CH // 2,
                text="No hand detected — press 'd' to skip, 'n' for next",
                fill="#f87171", font=("Menlo", 16))
        else:
            self._draw_points()
        self._draw_status()
        if self.show_help:
            self._draw_help()

    def _draw_points(self):
        for j in range(C.N_TOTAL):
            x, y = self._n2c(self.pts[j])
            if j in BASE:
                col, rad = COL_BASE, 3
            elif j in ACU_IDX:
                col, rad = COL_ACU, 6
            elif j in PALM:
                col, rad = COL_PALM, 5
            else:
                col, rad = COL_CUSTOM, 4
            if j == self.selected:
                self.canvas.create_oval(x - rad - 4, y - rad - 4,
                                        x + rad + 4, y + rad + 4,
                                        outline=COL_SEL, width=2)
            self.canvas.create_oval(x - rad, y - rad, x + rad, y + rad,
                                    fill=col, outline="#0b1220")
            if j in ACU_IDX:
                self.canvas.create_text(x + 10, y - 10, text=ACU_LABEL[j],
                    fill=COL_ACU, font=("Menlo", 10, "bold"), anchor="w")

    def _draw_status(self):
        fname = self.images[self.idx]
        done = len(self.annotated)
        self.status.config(
            text=f"{fname}   [{self.idx + 1}/{len(self.images)}]   "
                 f"{self.side} hand · {self.facing.upper()}")
        self.prog.config(text=f"annotated: {done}")
        seltxt = "—"
        if self.pts is not None:
            grp = ("BASE/locked" if self.selected in BASE else
                   ACU_LABEL.get(self.selected, "palm" if self.selected in PALM else "custom"))
            seltxt = f"point {self.selected} ({grp})"
        self.selbar.config(text=f"selected: {seltxt}    |    "
                                f"drag to move · arrows nudge · Tab cycle · 'a' acu · 'h' help")

    def _draw_help(self):
        lines = [
            "n/p next·prev   s save   r reseed   f flip face   a next acu-pt",
            "Tab/[ ] cycle point   arrows nudge   d skip   q save & quit",
            "grey=MediaPipe(locked)  cyan=finger  orange=palm  pink=acupressure",
        ]
        y = self.CH - 66
        self.canvas.create_rectangle(0, y - 8, self.CW, self.CH,
                                     fill="#000000", stipple="gray50", outline="")
        for i, ln in enumerate(lines):
            self.canvas.create_text(12, y + i * 20, text=ln, anchor="w",
                                    fill="#d1d5db", font=("Menlo", 11))

    def _toast(self, msg):
        self.canvas.create_text(self.CW // 2, 30, text=msg,
            fill="#22c55e", font=("Menlo", 14, "bold"))
        self.root.update_idletasks()

    # ── interaction ──────────────────────────────────────────────────────────
    def _pick(self, x, y):
        if self.pts is None:
            return None
        best, bd = None, 1e9
        for j in range(C.N_TOTAL):
            px, py = self._n2c(self.pts[j])
            d = (px - x) ** 2 + (py - y) ** 2
            if d < bd:
                bd, best = d, j
        return best if bd < 30 ** 2 else None

    def _on_down(self, e):
        if self.pts is None:
            return
        j = self._pick(e.x, e.y)
        if j is not None:
            self.selected = j
        if self.selected not in BASE:      # base points are locked
            self.dragging = True
            self._move_selected(e.x, e.y)

    def _on_drag(self, e):
        if self.dragging and self.selected not in BASE:
            self._move_selected(e.x, e.y)

    def _on_up(self, e):
        self.dragging = False

    def _move_selected(self, x, y):
        self.pts[self.selected] = self._c2n(x, y)
        self._render()

    def _nudge(self, dx, dy):
        if self.pts is None or self.selected in BASE:
            return
        s, dw, dh, ox, oy = self._geom
        self.pts[self.selected][0] = np.clip(self.pts[self.selected][0] + dx / dw, 0, 1)
        self.pts[self.selected][1] = np.clip(self.pts[self.selected][1] + dy / dh, 0, 1)
        self._render()

    def _cycle(self, step):
        order = sorted(ACU_IDX) if self.only_acu else list(range(21, C.N_TOTAL))
        if self.selected in order:
            self.selected = order[(order.index(self.selected) + step) % len(order)]
        else:
            self.selected = order[0]
        self._render()
        return "break"

    def _next_acu(self):
        order = sorted(ACU_IDX)
        nxt = [j for j in order if j > self.selected]
        self.selected = nxt[0] if nxt else order[0]
        self._render()

    def _reseed(self):
        pts_21, side = C.mediapipe_21(self.cv_img, self.hands)
        if pts_21 is not None:
            self.pts = self._seed_points(pts_21)
            self.facing = C.hand_facing(pts_21, side)
            self._render()
            self._toast("re-seeded from model")

    def _flip_face(self):
        self.facing = "back" if self.facing == "palm" else "palm"
        self._render()

    def _skip(self):
        self._toast("skipped")
        self.root.after(200, lambda: self._next(+1, save=False))

    def _toggle_help(self):
        self.show_help = not self.show_help
        self._render()

    def _next(self, step, save=True):
        if save and self.has_hand and self.pts is not None:
            self._save()
        self._load(self.idx + step)

    def _quit(self):
        if self.has_hand and self.pts is not None:
            self._save()
        self.hands.close()
        self.root.destroy()


def main():
    ap = argparse.ArgumentParser(description="64-point acupressure annotator")
    ap.add_argument("--start", type=int, default=None, help="image index to start at")
    ap.add_argument("--only-acu", action="store_true",
                    help="focus cycling on the 7 acupressure points only")
    args = ap.parse_args()
    Annotator(start=args.start, only_acu=args.only_acu)


if __name__ == "__main__":
    main()
