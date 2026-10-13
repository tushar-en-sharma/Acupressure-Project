/** Friendly point names: "SJ Right Shoulder" -> "Right shoulder",
 * "SJ Head-Front" -> "Head (front)". */
export function pointName(label) {
  const s = label.replace(/^SJ /, "");
  const m = s.match(/^(.*)-(Front|Back)$/);
  const base = m ? `${m[1]} (${m[2].toLowerCase()})` : s;
  return base.charAt(0) + base.slice(1).toLowerCase();
}
