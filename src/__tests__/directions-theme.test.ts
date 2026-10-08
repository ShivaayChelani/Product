import {
  DEFAULT_ROUTE_COLOR,
  INTERNAL_ROUTE_CASING_COLOR,
  INTERNAL_ROUTE_COLOR,
} from '../design/directionsTheme';

describe('internal directions theme', () => {
  it('uses the blue route color and a white contrast casing', () => {
    expect(INTERNAL_ROUTE_COLOR).toBe('#1E5FD9');
    expect(DEFAULT_ROUTE_COLOR).toBe(INTERNAL_ROUTE_COLOR);
    expect(INTERNAL_ROUTE_CASING_COLOR).toBe('#FFFFFF');
  });
});
