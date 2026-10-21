import { useMemo, useRef, useState } from "react";
import { IconBack, IconHand } from "./Icons";
import { streakDays, activeDays } from "../progress";

const W = 320, H = 150, PAD = { l: 28, r: 10, t: 10, b: 22 };

// Line chart of how it felt after pressing (dark) and before (light), 0 to 10.
function Chart({ points, id }) {
  const n = points.length;
  const x = (i) => PAD.l + (n === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v) => PAD.t + ((10 - v) * (H - PAD.t - PAD.b)) / 10;
  const line = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg id={id} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chart of check-in scores" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff" }}>
      {[0, 5, 10].map((v) => (
        <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e7dfd0" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#7a6a5a" fontFamily="system-ui, sans-serif">{v}</text></g>
      ))}
      {n > 1 && <path d={line("before")} fill="none" stroke="#d9c79b" strokeWidth="2" strokeDasharray="4 3" />}
      {n > 1 && <path d={line("after")} fill="none" stroke="#B8922F" strokeWidth="2.5" />}
      {points.map((p, i) => (
        <g key={p.id}><circle cx={x(i)} cy={y(p.before)} r="3" fill="#d9c79b" /><circle cx={x(i)} cy={y(p.after)} r="4.5" fill="#B8922F" />
          {(n <= 6 || i % Math.ceil(n / 6) === 0) && <text x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="#7a6a5a" fontFamily="system-ui, sans-serif">{p.label}</text>}</g>
      ))}
    </svg>
  );
}

const fileStamp = () => new Date().toISOString().slice(0, 10);
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fullDate = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function Progress({ entries, titleOf, t, onBack, onAdd, onRemove, onClear }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const wrap = useRef(null);
  const groups = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => { if (!map.has(e.problem)) map.set(e.problem, []); map.get(e.problem).push(e); });
    return [...map.entries()].sort((a, b) => b[1][b[1].length - 1].ts.localeCompare(a[1][a[1].length - 1].ts));
  }, [entries]);

  // Save a chart as a picture (also handy to send to a practitioner)
  async function savePicture(name, list, chartId) {
    const svg = wrap.current?.querySelector(`#${chartId}`);
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode().catch(() => {});
    const c = document.createElement("canvas");
    c.width = 960; c.height = 560;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#3B2D2E"; g.font = "600 34px system-ui, sans-serif"; g.fillText(`${name} – ${t.myProgress}`, 40, 60);
    g.fillStyle = "#7a6a5a"; g.font = "22px system-ui, sans-serif";
    g.fillText(`${list.length} ${t.checkins} · ${shortDate(list[0].ts)} – ${shortDate(list[list.length - 1].ts)}`, 40, 98);
    g.drawImage(img, 20, 120, 920, 920 * (H / W) > 400 ? 400 * (W / H) : 920, 920 * (H / W) > 400 ? 400 : 920 * (H / W));
    g.fillStyle = "#7a6a5a"; g.font = "18px system-ui, sans-serif";
    g.fillText(t.ciLegend, 40, 520); g.fillText("Revive Acupressure App – " + t.safetyShort, 40, 545);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], `revive-progress-${fileStamp()}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: t.myProgress }); return; } catch { /* cancelled: fall through to download */ } }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <section className="progress" ref={wrap} aria-label={t.myProgress}>
      <div className="pr-head">
        <button type="button" className="cam-btn pr-back" onClick={onBack}><IconBack size={22} /><span>{t.home}</span></button>
        <h1>{t.myProgress}</h1>
      </div>
      <p className="pr-priv">{t.progressPrivacy}</p>

      {entries.length === 0 ? (
        <div className="pr-empty">
          <IconHand size={56} />
          <p>{t.progressEmpty}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onBack}>{t.progressStart}</button>
        </div>
      ) : (<>
        <div className="pr-stats">
          <div><b>{entries.length}</b><span>{t.checkins}</span></div>
          <div><b>{activeDays(entries)}</b><span>{t.daysUsed}</span></div>
          <div><b>{streakDays(entries)}</b><span>{t.streak}</span></div>
        </div>
        {groups.map(([name, list], gi) => {
          const pts = list.map((e) => ({ ...e, label: shortDate(e.ts) }));
          const last = list[list.length - 1], first = list[0];
          const cid = `chart-${gi}`;
          const diff = list.length > 1 ? first.after - last.after : null;
          return (
            <article className="pr-card" key={name}>
              <h2>{titleOf(name)}</h2>
              <p className="pr-sum">
                {t.latest}: <b>{last.after}/10</b>
                {diff != null && diff !== 0 && <> · {diff > 0 ? t.felt.lower.replace("{n}", diff) : t.felt.higher.replace("{n}", -diff)}</>}
                {diff === 0 && <> · {t.felt.same}</>}
              </p>
              <Chart points={pts} id={cid} />
              <p className="pr-legend"><i className="k-after" /> {t.ciAfterShort} <i className="k-before" /> {t.ciBeforeShort}</p>
              <ul className="pr-list">
                {[...list].reverse().slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <span><b>{fullDate(e.ts)}</b> · {t.ciBeforeShort} {e.before} → {t.ciAfterShort} {e.after}{e.note && <em> “{e.note}”</em>}</span>
                    <button type="button" className="pr-del" aria-label={t.remove} onClick={() => onRemove(e.id)}>×</button>
                  </li>
                ))}
              </ul>
              <div className="pr-actions">
                <button type="button" className="btn btn-primary" onClick={() => onAdd(name)}>{t.addCheckin}</button>
                <button type="button" className="btn btn-ghost" onClick={() => savePicture(titleOf(name), list, cid)}>{t.savePicture}</button>
              </div>
            </article>
          );
        })}
        <p className="pr-note">{t.progressNote}</p>
        <div className="pr-clear">
          {confirmClear ? (<>
            <span>{t.clearSure}</span>
            <button type="button" className="btn btn-ghost" onClick={() => { onClear(); setConfirmClear(false); }}>{t.clearYes}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(false)}>{t.ciCancel}</button>
          </>) : <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(true)}>{t.clearAll}</button>}
        </div>
      </>)}
    </section>
  );
}
