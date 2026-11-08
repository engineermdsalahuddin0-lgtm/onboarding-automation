// Dates are stored as yyyy-mm-dd and handled as local calendar days; going through UTC would
// shift them by a day in Bangladesh time.

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export const todayIso = () => isoDate(new Date());

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 13/08/2026 */
export function dateDmy(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** 07/07/26 */
export function dateDmyShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}` : '';
}

/** Thursday */
export function dayName(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DAYS[d.getDay()] : '';
}

/** Tue */
export function dayShort(value: string | Date | null | undefined): string {
  return dayName(value).slice(0, 3);
}

/** 21st September 2026 */
export function dateOrdinal(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** 5 Nov 2026 */
export function dateMedium(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : '';
}

/** 5 Nov */
export function dayMonth(value: string | Date | null | undefined): string {
  return dateMedium(value).replace(/ \d{4}$/, '');
}

/** A stored day and time together: 5 Nov 2026, 3:15 PM. The time is left out when there is none. */
export function whenText(date: string | null | undefined, time: string | null | undefined): string {
  return [dateMedium(date), time12(time)].filter(Boolean).join(', ');
}

/** 42s, 3m 20s or 1h 5m */
export function duration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The current local time in the form an <input type="time"> uses. */
export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 5 Nov 2026, 3:15 PM */
export function dateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const hours = d.getHours() % 12 || 12;
  return `${dateMedium(d)}, ${hours}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** "just now", "12 min ago", "3 h ago", then the date and time. */
export function timeAgo(value: string | Date | null | undefined, now = Date.now()): string {
  const d = toDate(value);
  if (!d) return '';
  const minutes = Math.floor((now - d.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return dateTime(d);
}

/** Turns an <input type="time"> value (15:00) into 3:00 PM. Already formatted text passes through. */
export function time12(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : value.toLocaleString('en-US');
}

export function initials(name: string): string {
  const parts = name
    .replace(/\b(md|mst|mrs|mr|ms|dr)\.?\s+/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
