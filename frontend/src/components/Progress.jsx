import { useMemo, useRef, useState } from "react";
import { IconBack, IconHand } from "./Icons";
import { streakDays, activeDays } from "../progress";

const W = 320, H = 150, PAD = { l: 28, r: 22, t: 10, b: 22 };

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
      <defs><linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8922F" stopOpacity="0.35" /><stop offset="100%" stopColor="#B8922F" stopOpacity="0" /></linearGradient></defs>
      {n > 1 && <path d={`${line("after")} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`} fill={`url(#${id}-g)`} />}
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

// Gauge: latest score out of 10 (a lower number means feeling better)
function Ring({ value, size = 84, color = "#B8922F", label }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="pg-ring" style={{ width: size, height: size }} role="img" aria-label={`${label} ${value}/10`}>
      <svg viewBox="0 0 84 84" width={size} height={size}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--tint)" strokeWidth="9" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(value / 10) * c} ${c}`} transform="rotate(-90 42 42)" />
      </svg>
      <b>{value}<small>/10</small></b>
    </div>
  );
}

// Cards tilt a little towards the pointer (mouse only, not with reduced motion)
function tilt(e) {
  if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = e.currentTarget.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
  e.currentTarget.style.setProperty("--rx", `${(-py * 4).toFixed(2)}deg`);
  e.currentTarget.style.setProperty("--ry", `${(px * 5).toFixed(2)}deg`);
}
const untilt = (e) => { e.currentTarget.style.setProperty("--rx", "0deg"); e.currentTarget.style.setProperty("--ry", "0deg"); };

export default function Progress({ entries, titleOf, colorOf, t, onBack, onAdd, onRemove, onClear }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const wrap = useRef(null);
  const groups = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => { if (!map.has(e.problem)) map.set(e.problem, []); map.get(e.problem).push(e); });
    return [...map.entries()].sort((a, b) => b[1][b[1].length - 1].ts.localeCompare(a[1][a[1].length - 1].ts));
  }, [entries]);

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
    g.drawImage(img, 20, 120, 920 * (H / W) > 400 ? 400 * (W / H) : 920, 920 * (H / W) > 400 ? 400 : 920 * (H / W));
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
    <section className="pg" ref={wrap} aria-label={t.myProgress}>
      <header className="pg-hero">
        <button type="button" className="pg-home" onClick={onBack}><IconBack size={20} /><span>{t.home}</span></button>
        <h1>{t.myProgress}</h1>
        <p>{t.progressPrivacy}</p>
        {entries.length > 0 && (
          <div className="pg-tiles">
            {[[entries.length, t.checkins], [activeDays(entries), t.daysUsed], [streakDays(entries), t.streak]].map(([n, l]) => (
              <div className="pg-tile" key={l} onPointerMove={tilt} onPointerLeave={untilt}><b>{n}</b><span>{l}</span></div>
            ))}
          </div>
        )}
      </header>

      {entries.length === 0 ? (
        <div className="pg-empty">
          <span className="pg-empty-ico" aria-hidden="true"><IconHand size={44} /></span>
          <p>{t.progressEmpty}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onBack}>{t.progressStart}</button>
        </div>
      ) : (<>
        {groups.map(([name, list], gi) => {
          const pts = list.map((e) => ({ ...e, label: shortDate(e.ts) }));
          const last = list[list.length - 1], first = list[0];
          const cid = `chart-${gi}`;
          const diff = list.length > 1 ? first.after - last.after : null;
          const color = colorOf(name);
          const bars = list.slice(-8);
          return (
            <article className="pg-card" key={name} style={{ "--c": color }} onPointerMove={tilt} onPointerLeave={untilt}>
              <div className="pg-card-head">
                <Ring value={last.after} label={t.latest} color={color} />
                <div>
                  <h2>{titleOf(name)}</h2>
                  <p className="pg-sum">{t.latest}: <b>{last.after}/10</b> · {fullDate(last.ts)}</p>
                  {diff != null && (
                    <span className={`pg-trend ${diff > 0 ? "down" : diff < 0 ? "up" : "same"}`}>
                      {diff > 0 ? "▼ " + t.felt.lower.replace("{n}", diff) : diff < 0 ? "▲ " + t.felt.higher.replace("{n}", -diff) : "● " + t.felt.same}
                    </span>
                  )}
                </div>
              </div>

              <div className="pg-bars" role="img" aria-label={t.ciLegend}>
                {bars.map((e) => (
                  <div className="pg-col" key={e.id}>
                    <div className="pg-pair">
                      <i className="bar3d before" style={{ "--h": e.before / 10 }}><em>{e.before}</em></i>
                      <i className="bar3d after" style={{ "--h": e.after / 10 }}><em>{e.after}</em></i>
                    </div>
                    <span>{shortDate(e.ts)}</span>
                  </div>
                ))}
              </div>
              <p className="pg-legend"><i className="k-before" /> {t.ciBeforeShort} <i className="k-after" /> {t.ciAfterShort} · 0 = {t.ciNone.replace("0 = ", "")}, 10 = {t.ciWorst.replace("10 = ", "")}</p>

              {list.length > 1 && <div className="pg-trendline"><Chart points={pts} id={cid} /></div>}
              {list.length === 1 && <div className="pg-trendline pg-hidden"><Chart points={pts} id={cid} /></div>}

              <ul className="pg-list">
                {[...list].reverse().slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <span><b>{fullDate(e.ts)}</b><small>{t.ciBeforeShort} {e.before} → {t.ciAfterShort} {e.after}</small>{e.note && <em>“{e.note}”</em>}</span>
                    <button type="button" className="pg-del" aria-label={t.remove} onClick={() => onRemove(e.id)}>×</button>
                  </li>
                ))}
              </ul>
              <div className="pg-actions">
                <button type="button" className="btn btn-primary" onClick={() => onAdd(name)}>+ {t.addCheckin}</button>
                <button type="button" className="btn btn-ghost" onClick={() => savePicture(titleOf(name), list, cid)}>{t.savePicture}</button>
              </div>
            </article>
          );
        })}
        <p className="pg-note">{t.progressNote}</p>
        <div className="pg-clear">
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
