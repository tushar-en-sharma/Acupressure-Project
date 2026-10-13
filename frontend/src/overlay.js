import { pointName } from "./pointName";

// Draws the selected problem's points on a <canvas> in front of the live
// video. The front camera is mirrored with CSS for the "selfie" look; this
// canvas isn't (mirroring it would flip the labels backwards), so x is
// mirrored here instead and the circles land on the right spot with readable
// text. The back camera isn't mirrored at all, so x is used as-is.
// Sizes scale with the frame so they stay legible on small phone screens.

export function drawOverlay(ctx, width, height, points, mirrored = true) {
  ctx.clearRect(0, 0, width, height);
  if (!points.length) return;

  const u = Math.max(width, height) / 640; // 1 at 640px capture size
  const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(16 * u)}px system-ui, sans-serif`;

  for (const point of points) {
    const [nx, ny] = point.coord;
    const cx = (mirrored ? 1 - nx : nx) * width;
    const cy = ny * height;
    const color = point.color;

    ctx.beginPath();
    ctx.arc(cx, cy, 20 * u * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * u;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(cx, cy, 10 * u, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    const label = pointName(point.label);
    const tw = ctx.measureText(label).width;
    const pad = 8 * u;
    const lh = 28 * u;
    let lx = cx - tw / 2 - pad;
    lx = Math.min(Math.max(lx, 4), width - tw - 2 * pad - 4);
    const ly = cy - 30 * u - lh;
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.beginPath();
    ctx.roundRect(lx, ly, tw + 2 * pad, lh, 8 * u);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, lx + pad, ly + lh / 2);
  }
}
