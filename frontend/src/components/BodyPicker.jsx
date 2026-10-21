import { useEffect, useRef, useState } from "react";
import { IconFlip } from "./Icons";
import { track } from "../analytics";

// Where each problem's glowing dot sits on the 3D body: [x, y, z, side]. The
// body faces +z. "front" dots show on the front view, "back" dots on the back.
const SPOTS = {
  "Su Jok: Headache": [0, 1.9, 0.3, "front"],
  "Su Jok: Sore Throat": [0, 1.5, 0.14, "front"],
  "Su Jok: Neck Pain": [0, 1.52, -0.14, "back"],
  "Su Jok: Cough / Bronchitis": [-0.17, 1.2, 0.28, "front"],
  "Su Jok: Palpitations": [0.17, 1.1, 0.29, "front"],
  "Su Jok: Acidity / Indigestion": [0, 0.72, 0.3, "front"],
  "Su Jok: Constipation": [0, 0.38, 0.3, "front"],
  "Su Jok: Menstrual / Bladder Discomfort": [0, 0.02, 0.28, "front"],
  "Su Jok: Upper Back Pain": [0, 1.1, -0.3, "back"],
  "Su Jok: Lower Back Pain": [0, 0.5, -0.3, "back"],
  "Su Jok: Shoulder Pain": [-0.52, 1.38, 0.14, "front"],
  "Su Jok: Elbow Pain": [-0.64, 0.74, 0.11, "front"],
  "Su Jok: Wrist Pain": [-0.7, 0.16, 0.1, "front"],
  "Su Jok: Hip Pain": [-0.36, -0.02, 0.2, "front"],
  "Su Jok: Knee Pain": [-0.2, -1.25, 0.17, "front"],
  "Su Jok: Ankle Sprain": [-0.2, -2.1, 0.12, "front"],
  "Su Jok: Cold / Blocked Nose / Sinus": [0, 1.82, 0.3, "front"],
  "Su Jok: Dizziness": [0, 1.7, -0.3, "back"],
  "Su Jok: Hoarse Voice / Voice Strain": [0, 1.46, 0.14, "front"],
  "Su Jok: Chest Congestion": [0.0, 1.2, 0.28, "front"],
  "Su Jok: Breathing Discomfort": [-0.1, 1.25, 0.28, "front"],
  "Su Jok: Nausea": [0.1, 0.78, 0.3, "front"],
  "Su Jok: Loss of Appetite": [-0.1, 0.78, 0.3, "front"],
  "Su Jok: Gas / Bloating": [0.1, 0.55, 0.3, "front"],
  "Su Jok: Stomach Cramps": [-0.1, 0.45, 0.3, "front"],
  "Su Jok: Loose Motions": [0.1, 0.3, 0.3, "front"],
  "Su Jok: Period Pain": [-0.1, 0.06, 0.28, "front"],
  "Su Jok: Urinary Discomfort": [0.1, -0.02, 0.28, "front"],
  "Su Jok: General Backache": [0, 0.8, -0.3, "back"],
  "Su Jok: Sciatica-type Leg Pain": [-0.2, 0.3, -0.3, "back"],
};

function glowTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildBody(THREE, skin) {
  const body = new THREE.Group();
  const part = (geo, x, y, z = 0, s = [1, 1, 1], rz = 0) => {
    const m = new THREE.Mesh(geo, skin);
    m.position.set(x, y, z);
    m.scale.set(...s);
    m.rotation.z = rz;
    body.add(m);
  };
  part(new THREE.SphereGeometry(0.3, 32, 24), 0, 1.86);
  part(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 20), 0, 1.55);
  part(new THREE.CapsuleGeometry(0.34, 0.85, 10, 24), 0, 0.85, 0, [1, 1, 0.75]);
  part(new THREE.SphereGeometry(0.36, 28, 20), 0, 0.02, 0, [1, 0.85, 0.75]);
  part(new THREE.SphereGeometry(0.14, 20, 16), -0.5, 1.38);
  part(new THREE.SphereGeometry(0.14, 20, 16), 0.5, 1.38);
  [-1, 1].forEach((k) => {
    part(new THREE.CapsuleGeometry(0.1, 0.5, 8, 16), k * 0.6, 1.04, 0, [1, 1, 1], k * 0.06);
    part(new THREE.CapsuleGeometry(0.085, 0.5, 8, 16), k * 0.68, 0.46, 0, [1, 1, 1], k * 0.04);
    part(new THREE.SphereGeometry(0.1, 16, 12), k * 0.72, 0.08, 0, [0.9, 1.3, 0.7]);
    part(new THREE.CapsuleGeometry(0.15, 0.75, 10, 20), k * 0.2, -0.75);
    part(new THREE.CapsuleGeometry(0.11, 0.7, 8, 16), k * 0.2, -1.72);
    part(new THREE.SphereGeometry(0.13, 16, 12), k * 0.2, -2.32, 0.08, [0.9, 0.6, 1.5]);
  });
  return body;
}

// Step 1: a 3D body with one glowing dot per problem. Tap a dot to choose it.
export default function BodyPicker({ problems, value, onChange, onUnsupported, flipLabel }) {
  const boxRef = useRef(null);
  const valueRef = useRef(value);
  const sideRef = useRef("front");
  const [side, setSide] = useState("front");
  valueRef.current = value;
  sideRef.current = side;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    let dead = false;
    let cleanup = () => {};
    (async () => {
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) { onUnsupported?.(); return; }
      try {
        const THREE = await import("three");
        if (dead) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        el.appendChild(renderer.domElement);
        renderer.domElement.setAttribute("aria-hidden", "true");
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        camera.position.set(0, -0.1, 10.5);
        scene.add(new THREE.AmbientLight(0xfff1dc, 0.95));
        const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(3, 4, 5); scene.add(key);
        const rim = new THREE.DirectionalLight(0xdcc58a, 1.5); rim.position.set(-4, 1, -3); scene.add(rim);
        const skin = new THREE.MeshStandardMaterial({ color: 0xe6c9a6, roughness: 0.6, metalness: 0.02 });
        const body = buildBody(THREE, skin);
        scene.add(body);

        const glow = glowTexture(THREE);
        const spots = [];
        const hits = [];
        problems.forEach((p) => {
          const def = SPOTS[p.name];
          if (!def) return;
          const color = new THREE.Color(p.color || "#B8922F");
          const g = new THREE.Group();
          g.position.set(def[0], def[1], def[2]);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, depthTest: false }));
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), new THREE.MeshBasicMaterial({ color }));
          const hit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
          hit.userData.name = p.name;
          g.add(halo, core, hit);
          body.add(g);
          spots.push({ g, halo, core, hit, name: p.name, side: def[3] });
          hits.push(hit);
        });

        const resize = () => {
          const w = el.clientWidth || 1; const h = el.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h; camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize); ro.observe(el); resize();

        // Tap a dot to choose it; swipe sideways to turn the body round.
        const ray = new THREE.Raycaster();
        let down = null;
        const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
        const onUp = (e) => {
          if (!down) return;
          const dx = e.clientX - down.x; const dy = e.clientY - down.y;
          down = null;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { setSide((s) => (s === "front" ? "back" : "front")); return; }
          if (Math.hypot(dx, dy) > 10) return;
          const r = renderer.domElement.getBoundingClientRect();
          ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
          const visible = spots.filter((s) => s.g.visible).map((s) => s.hit);
          const hit = ray.intersectObjects(visible, false)[0];
          if (hit) { navigator.vibrate?.(15); onChange(hit.object.userData.name); }
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);

        let visibleOnScreen = true; let raf = 0;
        const io = new IntersectionObserver(([e]) => { visibleOnScreen = e.isIntersecting; if (visibleOnScreen) loop(); }, { threshold: 0.05 });
        io.observe(el);
        const frame = (t) => {
          const s = t / 1000;
          const target = sideRef.current === "front" ? 0 : Math.PI;
          const sway = reduce ? 0 : Math.sin(s * 0.7) * 0.12;
          body.rotation.y += (target + sway - body.rotation.y) * 0.08;
          body.position.y = reduce ? 0 : Math.sin(s * 0.9) * 0.04;
          const facingFront = Math.cos(body.rotation.y) > 0;
          spots.forEach((sp, i) => {
            const show = sp.side === (facingFront ? "front" : "back");
            sp.g.visible = show;
            const on = valueRef.current === sp.name;
            const pulse = 1 + Math.sin(s * 3 + i) * 0.2;
            sp.halo.scale.setScalar((on ? 0.95 : 0.5) * pulse);
            sp.core.scale.setScalar(on ? 1.7 : 1);
          });
          renderer.render(scene, camera);
        };
        const loop = () => { cancelAnimationFrame(raf); if (!visibleOnScreen) return; raf = requestAnimationFrame((t) => { frame(t); loop(); }); };
        frame(0);
        el.classList.add("ready");
        if (!reduce) loop();
        cleanup = () => {
          cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointerup", onUp);
          scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
          glow.dispose(); renderer.dispose(); renderer.domElement.remove();
        };
      } catch {
        onUnsupported?.();
      }
    })();
    return () => { dead = true; cleanup(); };
    // problems arrive once from the API; the scene is rebuilt only then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems.length]);

  return (
    <div className="body-picker">
      <div ref={boxRef} className="body-3d" />
      <button type="button" className="body-flip" onClick={() => { track("body_flipped"); setSide((s) => (s === "front" ? "back" : "front")); }} aria-label={flipLabel} title={flipLabel}>
        <IconFlip size={26} />
      </button>
    </div>
  );
}
