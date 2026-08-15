import { shouldRecordReelShare } from '../services/sharing/shareReelDecision';

describe('shouldRecordReelShare', () => {
  it('records iOS shares and ignores dismiss', () => {
    expect(shouldRecordReelShare({ platform: 'ios', threw: false, action: 'sharedAction' })).toBe(true);
    expect(shouldRecordReelShare({ platform: 'ios', threw: false, action: 'dismissedAction' })).toBe(false);
    expect(shouldRecordReelShare({ platform: 'ios', threw: true, action: null })).toBe(false);
  });

  it('records Android shares even when the native sheet throws after send', () => {
    expect(shouldRecordReelShare({ platform: 'android', threw: false, action: 'sharedAction' })).toBe(true);
    expect(shouldRecordReelShare({ platform: 'android', threw: true, action: null })).toBe(true);
  });
});
