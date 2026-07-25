/**
 * Datum/tijd-weergave — nl-NL, Europe/Amsterdam, 24-uurs (spec §2).
 * Opslag altijd UTC (timestamptz); alleen weergave loopt via deze module.
 */

const TZ = 'Europe/Amsterdam';
const LOCALE = 'nl-NL';

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function formatDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)}, ${formatTime(iso)} uur`;
}

export function formatWeekday(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: 'long' }).format(d);
}

export function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: 'long', year: 'numeric' }).format(d);
}

/** 'zo 19 juli, 10:00 uur' — compact voor kaarten. */
export function formatEventMoment(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const day = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${day}, ${formatTime(d)} uur`;
}

export function isSameDay(a: Date, b: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(a) === fmt.format(b);
}

/** Relatief: 'zojuist', '5 min geleden', 'gisteren', anders datum. */
export function formatRelative(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gisteren';
  if (days < 7) return `${days} dagen geleden`;
  return formatDateShort(d);
}
