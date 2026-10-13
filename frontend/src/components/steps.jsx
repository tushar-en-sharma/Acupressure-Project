export const ICON_STYLE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

export const STEPS = [
  {
    title: "Pick what to ease",
    text: "Choose a concern, such as a headache or a stiff neck.",
    icon: <path d="M4 7h16M4 12h10M4 17h7" />,
  },
  {
    title: "See where to press",
    text: "A hand diagram marks the exact spot for that concern.",
    icon: (
      <>
        <path d="M8 21v-8l-2-3 1.5-1L9 11V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v9c0 3-2 6-5 6z" />
      </>
    ),
  },
  {
    title: "Find it on your hand",
    text: "Use your camera: the spot glows live on your own hand.",
    icon: (
      <>
        <path d="M3 8h3l1.5-2h9L18 8h3v11H3z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    title: "Press gently",
    text: "Small circles with a thumbnail or pen cap for 1–2 minutes.",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
      </>
    ),
  },
];

