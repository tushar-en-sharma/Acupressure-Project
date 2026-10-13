import { STEPS, ICON_STYLE as S } from "./steps.jsx";

export default function HowItWorks({ onOpenIntro }) {
  return (
    <section className="how" aria-labelledby="how-h">
      <h2 id="how-h">How the Revive Acupressure App works</h2>
      <p className="how-lede">
        In Su Jok, your hand is a small map of your body. Gentle pressure on points of
        the hand is used as a complementary approach to everyday wellbeing.
      </p>
      <ol className="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ "--i": i }}>
            <span className="how-ico">
              <svg viewBox="0 0 24 24" aria-hidden="true" {...S}>{s.icon}</svg>
              <span className="how-num">{i + 1}</span>
            </span>
            <span className="how-text">
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="how-privacy">
        The camera runs on your device only &mdash; nothing is uploaded.{" "}
        <button type="button" className="link-btn" onClick={onOpenIntro}>Watch the quick intro</button>
      </p>
    </section>
  );
}
