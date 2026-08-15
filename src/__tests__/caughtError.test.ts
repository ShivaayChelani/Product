import { caughtErrorMessage } from '../utils/caughtError';

describe('caughtErrorMessage', () => {
  it('prefers joined field errors over generic Validation failed text', () => {
    const err = Object.assign(new Error('Bio must be at least 20 characters\nInstagram link is required'), {
      data: { message: 'Validation failed', errors: [{ field: 'bio', message: 'Bio must be at least 20 characters' }] },
      errors: [{ field: 'bio', message: 'Bio must be at least 20 characters' }],
    });
    expect(caughtErrorMessage(err, 'fallback')).toBe('Bio must be at least 20 characters');
  });
});
