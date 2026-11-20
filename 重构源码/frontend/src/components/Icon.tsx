const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  video:
    '<rect x="3" y="4.6" width="18" height="14.8" rx="4"/><path d="M10.4 9.6 14.6 12l-4.2 2.4Z" fill="currentColor" stroke="none"/>',
  doc: '<path d="M5.6 5.6c0-.8.7-1.5 1.5-1.5h6.3l5.5 5.4v9.5c0 .8-.7 1.5-1.5 1.5H7.1c-.8 0-1.5-.7-1.5-1.5V5.6Z"/><path d="M9 13.2h6M9 16.4h3.8"/>',
  folder:
    '<path d="M3.6 7.6c0-1.1.9-2 2-2h3l2 2.2h7.8c1.1 0 2 .9 2 2v7.6c0 1.1-.9 2-2 2H5.6c-1.1 0-2-.9-2-2V7.6Z"/>',
  users:
    '<circle cx="9.4" cy="8.4" r="3.2"/><path d="M3.8 19.4c.6-3 2.9-4.8 5.6-4.8s5 1.8 5.6 4.8"/><path d="M16.1 5.7c1.6.4 2.6 1.8 2.6 3.4 0 1.4-.9 2.7-2.2 3.2"/><path d="M16.9 19.4c-.2-1.3-.6-2.4-1.3-3.3"/>',
  search: '<circle cx="11" cy="11" r="6.8"/><path d="M16 16l4.2 4.2"/>',
  plus: '<path d="M12 5.6v12.8M5.6 12h12.8"/>',
  minus: '<path d="M5.6 12h12.8"/>',
  chevronRight: '<path d="M9.6 6.6 15 12l-5.4 5.4"/>',
  chevronDown: '<path d="M6.6 9.6 12 15l5.4-5.4"/>',
  chevronLeft: '<path d="M14.4 6.6 9 12l5.4 5.4"/>',
  download:
    '<path d="M12 4.6v11.2m0 0-4.1-4.1M12 15.8l4.1-4.1"/><path d="M4.8 19.4h14.4"/>',
  upload: '<path d="M12 16.2V4.8m0 0-4.1 4.1M12 4.8l4.1 4.1"/><path d="M4.8 19h14.4"/>',
  trash:
    '<path d="M4.8 6.8h14.4M9.7 6.8V5c0-.6.5-1.1 1.1-1.1h2.4c.6 0 1.1.5 1.1 1.1v1.8"/><path d="M6.6 6.8l.8 12c0 .7.6 1.2 1.2 1.2h6.8c.7 0 1.2-.5 1.2-1.2l.8-12"/>',
  play: '<path d="M9.4 7.6 16.4 12l-7 4.4Z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="8" y="7" width="2.8" height="10" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.2" y="7" width="2.8" height="10" rx="1.2" fill="currentColor" stroke="none"/>',
  more: '<circle cx="5.4" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.6" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  check: '<path d="M5 12.6l4.2 4.2L19 7"/>',
  checkCircle:
    '<circle cx="12" cy="12" r="9.2" fill="currentColor" stroke="none"/><path d="M7.9 12.4l2.7 2.7 5.2-5.4" stroke="#fff" stroke-width="2"/>',
  circle: '<circle cx="12" cy="12" r="8.4"/>',
  wand:
    '<path d="M4.6 19.4l1.2-4.2 8.9-8.9a2.2 2.2 0 0 1 3.1 0l.9.9a2.2 2.2 0 0 1 0 3.1l-8.9 8.9-4.2 1.2Z"/><path d="M13.4 7.6l3 3"/>',
  send: '<path d="M20 4 3.8 10.6l6.4 2.7 2.7 6.4L20 4Z"/><path d="M10.2 13.3 14.6 8.9"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>',
  image:
    '<rect x="3.6" y="4.8" width="16.8" height="14.4" rx="3.4"/><circle cx="9" cy="10" r="1.6"/><path d="M4.4 17.6l4.6-4.2 4 3.6 3-2.6 3.6 3.2"/>',
  film: '<rect x="3.2" y="6.4" width="13.2" height="11.2" rx="3.2"/><path d="M19.2 8.6v6.4c0 1.9-1.5 3.4-3.4 3.4H8.2"/>',
  edit: '<path d="M4.6 19.4l1.2-4.2 8.9-8.9a2.2 2.2 0 0 1 3.1 0l.9.9a2.2 2.2 0 0 1 0 3.1l-8.9 8.9-4.2 1.2Z"/><path d="M13.4 7.6l3 3"/>',
  shield:
    '<path d="M12 3.6l7 2.6v6c0 3.6-2.8 6.6-7 8.2-4.2-1.6-7-4.6-7-8.2v-6l7-2.6Z"/><path d="M9 12l2.2 2.2 4-4.2"/>',
  arrowUpRight: '<path d="M7.6 16.4 16.4 7.6M9.4 7.6h7v7"/>',
  upload2: '<path d="M12 15.4V4.6m0 0L7.6 9M12 4.6 16.4 9"/><path d="M4.6 15v3c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8v-3"/>',
  sort: '<path d="M8 5.6v12.8m0 0-3-3m3 3 3-3"/><path d="M16 18.4V5.6m0 0-3 3m3-3 3 3"/>',
  list: '<path d="M8.6 6.8h11.8M8.6 12h11.8M8.6 17.2h11.8"/><circle cx="4.4" cy="6.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.4" cy="17.2" r="1.3" fill="currentColor" stroke="none"/>',
  gear:
    '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.2a7.6 7.6 0 0 0 0-4.4l-1.9-.4a6 6 0 0 0-.9-1.5l.9-1.7a7.7 7.7 0 0 0-3.1-1.8l-1.2 1.5a6 6 0 0 0-1.8 0L10.2 4.4a7.7 7.7 0 0 0-3.1 1.8l.9 1.7c-.4.4-.7.9-.9 1.5l-1.9.4a7.6 7.6 0 0 0 0 4.4l1.9.4c.2.6.5 1 .9 1.5l-.9 1.7a7.7 7.7 0 0 0 3.1 1.8l1.2-1.5c.6.1 1.2.1 1.8 0l1.2 1.5a7.7 7.7 0 0 0 3.1-1.8l-.9-1.7c.4-.4.7-.9.9-1.5l1.9-.4Z"/>',
  key: '<circle cx="8.4" cy="8.6" r="3.6"/><path d="M11 11.2 19 19.2M16.2 16.4l1.8-1.8M14 14.2l1.8-1.8"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="9.4" rx="3"/><path d="M8.4 10.4V8.2a3.6 3.6 0 0 1 7.2 0v2.2"/>',
  eye: '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:
    '<path d="M4.4 8.4C3.1 9.8 2.6 12 2.6 12S6 17.6 12 17.6c1.3 0 2.5-.3 3.5-.7"/><path d="M9.6 7c.8-.3 1.6-.5 2.4-.5 6 0 9.4 5.5 9.4 5.5s-1 1.7-2.8 3.2"/><path d="M4 4l16 16"/>',
  refresh:
    '<path d="M19.4 12a7.4 7.4 0 0 1-12.9 5"/><path d="M4.6 12a7.4 7.4 0 0 1 12.9-5"/><path d="M17.4 3.8v3.6h-3.6M6.6 20.2v-3.6h3.6"/>',
  filter: '<path d="M4.4 6.2h15.2L13.6 13v5.6l-3.2 1.8V13L4.4 6.2Z"/>',
  logout: '<path d="M14.6 5.4h3c1 0 1.8.8 1.8 1.8v9.6c0 1-.8 1.8-1.8 1.8h-3"/><path d="M10.4 8.2 6.6 12l3.8 3.8"/><path d="M6.6 12h10"/>',
  copy: '<rect x="8.4" y="8.4" width="11" height="11" rx="2.6"/><path d="M15.6 8.4V6.2c0-1.1-.9-2-2-2H6.2c-1.1 0-2 .9-2 2v7.4c0 1.1.9 2 2 2h2.2"/>',
  alert: '<path d="M12 4.6 3.4 19.4h17.2L12 4.6Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  type: '<path d="M4.6 6.6V4.8h14.8v1.8"/><path d="M12 4.8v14.4M9 19.2h6"/>',
  sliders:
    '<path d="M5 7.4h9M17.4 7.4h1.6M5 16.6h1.6M10 16.6h9"/><circle cx="15.4" cy="7.4" r="2.2"/><circle cx="8" cy="16.6" r="2.2"/>',
  database:
    '<ellipse cx="12" cy="6.4" rx="7.4" ry="2.8"/><path d="M4.6 6.4v11.2c0 1.5 3.3 2.8 7.4 2.8s7.4-1.3 7.4-2.8V6.4"/><path d="M4.6 12c0 1.5 3.3 2.8 7.4 2.8s7.4-1.3 7.4-2.8"/>',
  palette:
    '<path d="M12 3.8a8.2 8.2 0 0 0 0 16.4c1.4 0 2-.9 2-1.8 0-1.5-1.4-1.6-1.4-2.7 0-.8.7-1.4 1.6-1.4h1.4c2 0 3.6-1.6 3.6-3.6 0-3.8-3.4-6.9-7.2-6.9Z"/><circle cx="8.2" cy="9.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.4" cy="7.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.4" cy="13.6" r="1.1" fill="currentColor" stroke="none"/>',
  external: '<path d="M13.4 4.8h5.8v5.8"/><path d="M19.2 4.8 11 13"/><path d="M18.2 14v4.2c0 1-.8 1.8-1.8 1.8H5.6c-1 0-1.8-.8-1.8-1.8V7.4c0-1 .8-1.8 1.8-1.8H10"/>',
  chart: '<path d="M4.4 19.4h15.2"/><rect x="6" y="11" width="3" height="6" rx="1" fill="currentColor" stroke="none"/><rect x="10.6" y="6.6" width="3" height="10.4" rx="1" fill="currentColor" stroke="none"/><rect x="15.2" y="9" width="3" height="8" rx="1" fill="currentColor" stroke="none"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="2.6"/><path d="M10 3.6v2.2M14 3.6v2.2M10 18.2v2.2M14 18.2v2.2M3.6 10h2.2M3.6 14h2.2M18.2 10h2.2M18.2 14h2.2"/>',
  logo: '<rect x="3.6" y="4.8" width="16.8" height="14.4" rx="3.4"/><path d="M7.6 15.2 11 9.6l2.4 3.4 1.8-2.2 1.4 4.4H7.6Z"/>',
};

export interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 18, stroke = 1.7, className = '', style }: IconProps) {
  const body = ICONS[name] || '';
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
