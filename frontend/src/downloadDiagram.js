/** Save a rendered HandDiagram <svg> as a PNG (2x for sharpness). Kept out
 * of HandDiagram.jsx so that file only exports components (fast refresh). */
export function downloadDiagram(svgEl, filename) {
  if (!svgEl) return;
  const xml = new XMLSerializer().serializeToString(svgEl);
  const { width, height } = svgEl.viewBox.baseVal;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}
