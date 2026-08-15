/**
 * Android share sheets often reject after a successful send (or treat Back as an
 * error). iOS reports dismiss vs share. Count Android completions either way.
 */
export function shouldRecordReelShare(opts: {
  platform: string;
  threw: boolean;
  action?: string | null;
}): boolean {
  if (opts.threw) return opts.platform === 'android';
  if (opts.platform === 'ios') return opts.action === 'sharedAction';
  return true;
}
