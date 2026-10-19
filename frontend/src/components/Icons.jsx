/* oxlint-disable react/only-export-components -- icon factory, not a fast-refresh component module */
// Small inline icon set so the main flow can be understood without reading.
const base = { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
const mk = (children) => function Icon({ size = 24, ...p }) { return <svg {...base} width={size} height={size} {...p}>{children}</svg>; };

export const IconBody = mk(<><circle cx="12" cy="4.5" r="2.3" /><path d="M12 8v6m0 0-3 7m3-7 3 7M6.5 10.5 12 9l5.5 1.5" /></>);
export const IconHand = mk(<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4 14.5a1.6 1.6 0 0 1 2.4-2L8 14" />);
export const IconCamera = mk(<><path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IconFlipCam = mk(<><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><path d="M9 13.5a3 3 0 0 1 5-1.6l.6.6M15 14.5a3 3 0 0 1-5 1.6l-.6-.6M14.8 10.8v1.9h-1.9M9.2 16.2v-1.9h1.9" /></>);
export const IconBack = mk(<path d="M15 5l-7 7 7 7" />);
export const IconNext = mk(<path d="M5 12h14m-6-6 6 6-6 6" />);
export const IconSpeaker = mk(<path d="M3 9v6h4l5 4V5L7 9zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />);
export const IconStop = mk(<rect x="6" y="6" width="12" height="12" rx="2" />);
export const IconFlip = mk(<><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M20 4v5h-5M4 20v-5h5" /></>);
export const IconList = mk(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const IconLock = mk(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconCheck = mk(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconDownload = mk(<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />);
export const IconClock = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconRepeat = mk(<path d="M17 4l3 3-3 3M4 11V9a2 2 0 0 1 2-2h14M7 20l-3-3 3-3M20 13v2a2 2 0 0 1-2 2H4" />);
export const IconNoCam = mk(<><path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><path d="M3 3l18 18" /></>);

// Large simple hand silhouettes for the camera guide: palm (with creases) or back (with nails).
export function HandGuide({ face = "palm", className = "" }) {
  return (
    <svg className={className} viewBox="0 0 120 150" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M34 78V44a7 7 0 0 1 14 0v28m0-40a7 7 0 0 1 14 0v38m0-34a7 7 0 0 1 14 0v34m0-24a7 7 0 0 1 14 0v46c0 26-14 40-34 40-14 0-22-6-30-18L18 96a7 7 0 0 1 11-9l5 7" />
      {face === "palm"
        ? <path d="M44 100c8 6 20 6 30 0M46 116c8 5 18 5 26 0" opacity="0.7" />
        : <><rect x="36" y="38" width="10" height="14" rx="5" opacity="0.7" /><rect x="52" y="30" width="10" height="14" rx="5" opacity="0.7" /><rect x="68" y="34" width="10" height="14" rx="5" opacity="0.7" /><rect x="84" y="46" width="9" height="12" rx="4.5" opacity="0.7" /></>}
    </svg>
  );
}
