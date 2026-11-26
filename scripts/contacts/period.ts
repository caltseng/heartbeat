import { CollectionError, requireValue, object, text, instant } from './lib.ts';

export type PeriodPreset = '7d' | '30d' | 'custom';
export interface PeriodRequest {
  preset: PeriodPreset;
  timeZone: string;
  asOf: string;
  start?: string;
  end?: string;
}
export interface ResolvedPeriod {
  preset: PeriodPreset;
  timeZone: string;
  start: string;
  end: string;
  asOf: string;
  bounds: '[start,end)';
  currentDayPartial: boolean;
}
function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch (error) {
    if (error instanceof RangeError) throw new CollectionError('invalid_input', 'period.timeZone must be a supported IANA time zone.');
    throw error;
  }
}
function localDate(formatter: Intl.DateTimeFormat, time: number): string {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function resolvePeriod(input: unknown): ResolvedPeriod {
  object(input, ['preset', 'timeZone', 'asOf', 'start', 'end'], 'period');
  const timeZone = text(input.timeZone, 'period.timeZone');
  const formatter = dateFormatter(timeZone);
  const asOf = instant(input.asOf, 'period.asOf');
  const preset = input.preset;
  requireValue(preset === '7d' || preset === '30d' || preset === 'custom', 'period.preset must be 7d, 30d, or custom.');
  let start: string, end: string;
  if (preset === 'custom') {
    start = instant(input.start, 'period.start');
    end = instant(input.end, 'period.end');
  } else {
    requireValue(input.start === undefined && input.end === undefined, 'Preset periods resolve their own boundaries.');
    const today = localDate(formatter, Date.parse(asOf));
    const target = new Date(Date.parse(`${today}T00:00:00Z`) - (preset === '7d' ? 6 : 29) * 86400000).toISOString().slice(0, 10);
    const anchor = Date.parse(`${target}T00:00:00Z`);
    let low = anchor - 36 * 3600000, high = anchor + 36 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (localDate(formatter, middle) < target) low = middle + 1;
      else high = middle;
    }
    requireValue(localDate(formatter, low) === target, 'The requested start calendar day does not exist in this time zone; use an explicit custom interval.');
    start = new Date(low).toISOString();
    end = asOf;
  }
  requireValue(start < end && end <= asOf, 'The interval must be nonempty and end no later than asOf.');
  return { preset, timeZone, start, end, asOf, bounds: '[start,end)', currentDayPartial: preset !== 'custom' };
}
