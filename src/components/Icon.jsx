/**
 * Inline SVG icon set. No icon font, no network request — this app has to work
 * on a phone that has been offline for a week.
 * Everything is stroked with currentColor on a 24x24 grid.
 */

const P = {
  /* --- bucket icons --- */
  inbox: <path d="M3 13h4l2 3h6l2-3h4M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6zM10 19a2 2 0 0 0 4 0" />,
  stethoscope: (
    <>
      <path d="M12 3v6M9 6h6" />
      <path d="M5 12v3a7 7 0 0 0 14 0v-3" />
      <circle cx="5" cy="11" r="1.6" />
      <circle cx="19" cy="11" r="1.6" />
    </>
  ),
  heart: <path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20z" />,
  child: (
    <>
      <circle cx="12" cy="6" r="2.6" />
      <path d="M12 9v7M8 11h8M9.5 21l2.5-5 2.5 5" />
    </>
  ),
  check: <path d="M4 12.5 9.5 18 20 6" />,
  cart: (
    <>
      <path d="M3 5h2.2l2.3 10h9.6l2-7H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  note: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5" />,
  bulb: (
    <>
      <path d="M9 17h6M10 20h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1 .9 1.6h5.2c0-.6.3-1.1.9-1.6A6 6 0 0 0 12 3z" />
    </>
  ),
  star: <path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.2-5.4-2.9-5.4 2.9 1-6.2L3.2 10l6.1-.9z" />,
  flag: <path d="M6 21V4m0 0 12 3-4 4 4 4-12 3" />,
  phone: (
    <path d="M6 3h3l2 5-2.2 1.4a12 12 0 0 0 5.8 5.8L16 13l5 2v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.2 2 2 0 0 1 6 3z" />
  ),
  car: (
    <>
      <path d="M4 15v-3l2-5h12l2 5v3M3 15h18v3h-3v-3M6 18H3v-3" />
      <circle cx="7.5" cy="18" r="1.4" />
      <circle cx="16.5" cy="18" r="1.4" />
    </>
  ),
  tools: (
    <path d="M14.5 4.5a4 4 0 0 0 5 5L10 19l-3.5.5L7 16zM4 4l4 4M6 4 4 6" />
  ),
  home: <path d="M4 11 12 4l8 7v9H4zM10 20v-6h4v6" />,
  money: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  pill: (
    <>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-30 12 12)" />
      <path d="M9.4 6.6 14.6 17.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,

  /* --- app chrome --- */
  buckets: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.5l2 1.2M17.5 15.3l2 1.2M4.5 16.5l2-1.2M17.5 8.7l2-1.2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  restart: <path d="M4 11a8 8 0 1 1 2.3 5.7M4 5v6h6" />,
  pencil: <path d="M4 20h4L20 8l-4-4L4 16zM14.5 5.5l4 4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="M15 5 8 12l7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowUp: <path d="M12 20V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 4v15M6 13l6 6 6-6" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  arrowLeft: <path d="M20 12H5M11 6l-6 6 6 6" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 5.5A2 2 0 0 0 13.5 3.5h-7a3 3 0 0 0-3 3v7a2 2 0 0 0 2 2" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.3 10.8 7.4-4M8.3 13.2l7.4 4" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  download: <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />,
  upload: <path d="M12 20V8M7 12l5-5 5 5M4 4h16" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5V20h14V8.5M10 12.5h4" />
    </>
  ),
  undo: <path d="M4 9h10a5 5 0 0 1 0 10h-3M4 9l4-4M4 9l4 4" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  warning: <path d="M12 4 2.5 20h19zM12 10v4.5M12 17.2v.6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.6" />
    </>
  ),
  book: <path d="M4 4.5h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v13h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5.5v13" />,
  text: <path d="M4 6h16M4 12h16M4 18h10" />,
  vibrate: <path d="M8 5h8v14H8zM4 9v6M20 9v6" />,
  install: <path d="M12 3v11M8 10l4 4 4-4M4 17v3h16v-3" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.2 2" />
    </>
  ),
}

export const ICON_NAMES = Object.keys(P)

export default function Icon({ name, size = 24, strokeWidth = 1.8, className = '', filled = false, ...rest }) {
  const body = P[name] || P.note
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {body}
    </svg>
  )
}
