export function chainTimestampToIso(chainTimestampSeconds: number): string {
  return new Date(chainTimestampSeconds * 1000).toISOString();
}
