// Drawn icons for the Elite Data design. 24px grid, stroked, no emoji.
const PATHS = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9h5v-5h3v5h5v-9",
  buy: "M3 5h2l1.4 8.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.4L20 8H6M9 20h.01M17 20h.01",
  track: "M9 5H7a2 2 0 0 0-2 2v12h14V7a2 2 0 0 0-2-2h-2M9 5a3 3 0 0 1 6 0M9 12h6M9 16h4",
  voucher: "M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  back: "M15 5l-7 7 7 7",
  menu: "M4 7h16M4 12h16M4 17h16",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3ZM9 12l2.2 2.2L15.5 10",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM12 18h.01",
  lock: "M6 11h12v9H6v-9Zm3 0V8a3 3 0 0 1 6 0v3",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  chat: "M5 5h14v10H10l-4 4v-4H5V5Z",
  sms: "M4 5h16v11H9l-5 4V5ZM8 9.5h8M8 12.5h5",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  money: "M3 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 0 2.5-3.5H17M16 14h.01",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2ZM10 21h4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  copy: "M8 8h11v12H8V8Zm-3 8V4h11",
  retry: "M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5",
  hand: "M8 12V6a1.5 1.5 0 0 1 3 0v5m0-1V5a1.5 1.5 0 0 1 3 0v6m0-4a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.4-1.8L8 14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  up: "M6 15l6-6 6 6",
  drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  store: "M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M10 20v-6h4v6",
  tag: "M4 12V4h8l8 8-8 8-8-8ZM8 8h.01",
  plusbox: "M12 8v8M8 12h8M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  refund: "M4 12a8 8 0 1 1 2.4 5.7M4 12V7m0 5h5M12 8v8M14.5 9.5c-.6-.6-1.4-.9-2.5-.9-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.3-2.6-.9",
  whatsapp: "M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, small = false, className = "" }: { name: IconName; small?: boolean; className?: string }) {
  return (
    <svg className={`ed-icon${small ? " s" : ""} ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} strokeWidth={name === "more" ? 3.4 : undefined} />
    </svg>
  );
}
