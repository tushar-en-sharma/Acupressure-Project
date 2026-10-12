// Ports backend/detector/camera.py's old draw_overlay() (removed now that
// the backend no longer has a video frame to draw on) — lean overlay of
// just the active acupressure points, drawn on a <canvas> in front of the
// live video.
//
// The video element is mirrored with a CSS transform for the "selfie" look
// (see index.css), but this canvas isn't — mirroring it the same way would
// also flip point labels backwards. Instead we mirror the x-coordinate here
// so circles land in the right place while text stays readable.

export function drawOverlay(ctx, width, height, activePoints) {
  ctx.clearRect(0, 0, width, height);

  if (!activePoints.length) return;

  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textBaseline = "middle";

  for (const point of activePoints) {
    const [nx, ny] = point.coord;
    const cx = (1 - nx) * width;
    const cy = ny * height;
    const color = point.color;

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const label = point.label;
    const textWidth = ctx.measureText(label).width;
    const lx = cx - textWidth / 2;
    const ly = cy - 22;

    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, ly + 4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(20, 20, 20, 0.65)";
    ctx.fillRect(lx - 6, ly - 12, textWidth + 12, 22);

    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
  }
}

export function drawPlaceholderMessage(ctx, width, height, message) {
  ctx.clearRect(0, 0, width, height);
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(215, 215, 215, 0.9)";
  ctx.fillText(message, width / 2, height / 2);
  ctx.textAlign = "left";
}
