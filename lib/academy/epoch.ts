const ACADEMY_EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type AcademyEpochWindow = {
  epoch: number;
  startsAt: string;
  endsAt: string;
  startsAtMs: number;
  endsAtMs: number;
  isCurrent: boolean;
};

export function getAcademyEpochNumber(timestampMs = Date.now()): number {
  return Math.floor(timestampMs / ACADEMY_EPOCH_DURATION_MS) + 1;
}

export function getAcademyEpochStartMs(epochNumber: number): number {
  return Math.max(0, epochNumber - 1) * ACADEMY_EPOCH_DURATION_MS;
}

export function getAcademyEpochEndMs(epochNumber: number): number {
  return getAcademyEpochStartMs(epochNumber) + ACADEMY_EPOCH_DURATION_MS - 1;
}

export function getAcademyEpochWindow(
  epochNumber: number,
  referenceTimestampMs = Date.now(),
): AcademyEpochWindow {
  const startsAtMs = getAcademyEpochStartMs(epochNumber);
  const endsAtMs = getAcademyEpochEndMs(epochNumber);

  return {
    epoch: epochNumber,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    startsAtMs,
    endsAtMs,
    isCurrent: epochNumber === getAcademyEpochNumber(referenceTimestampMs),
  };
}

const academyEpochDateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAcademyEpochBoundary(timestampMs: number): string {
  return `${academyEpochDateTimeFormat.format(timestampMs)} UTC`;
}

export function formatAcademyEpochRange(window: AcademyEpochWindow): string {
  return `${formatAcademyEpochBoundary(window.startsAtMs)} → ${formatAcademyEpochBoundary(window.endsAtMs)}`;
}

export function formatAcademyEpochRangeFromIso(input: {
  startsAt: string;
  endsAt: string;
}): string {
  return `${formatAcademyEpochBoundary(Date.parse(input.startsAt))} → ${formatAcademyEpochBoundary(Date.parse(input.endsAt))}`;
}
