describe('auth storage crash safety', () => {
  it('updateUserProfile and setActiveMode wrap JSON.parse so corrupt storage cannot throw', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../services/authService.ts'),
      'utf8',
    );
    const updateFn = src.slice(
      src.indexOf('export async function updateUserProfile'),
      src.indexOf('export async function setActiveMode'),
    );
    const modeFn = src.slice(
      src.indexOf('export async function setActiveMode'),
      src.indexOf('export async function refreshSessionRoles'),
    );
    expect(updateFn).toMatch(/try\s*\{[\s\S]*(JSON\.parse|parseJsonObject)/);
    expect(updateFn).toMatch(/catch/);
    expect(modeFn).toMatch(/try\s*\{[\s\S]*(JSON\.parse|parseJsonObject)/);
    expect(modeFn).toMatch(/catch/);
  });
});
