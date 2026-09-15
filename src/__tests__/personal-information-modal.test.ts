import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../components/profile/PersonalInformationModal.tsx'),
  'utf8',
);

describe('Personal Information modal polish wiring', () => {
  it('keeps the existing fields, save path, and read-only contact rows', () => {
    expect(src).toMatch(/Full Name/);
    expect(src).toMatch(/Username \(optional\)/);
    expect(src).toMatch(/Email/);
    expect(src).toMatch(/Phone Number/);
    expect(src).toMatch(/City/);
    expect(src).toMatch(/State/);
    expect(src).toMatch(/Gender \(optional\)/);
    expect(src).toMatch(/Date of Birth \(optional\)/);
    expect(src).toMatch(/Travel Interests/);
    expect(src).toMatch(/Language/);
    expect(src).toMatch(/Bio \(optional\)/);
    expect(src).toMatch(/onPress=\{onSave\}/);
    expect(src).toMatch(/Save Changes/);
    expect(src).toMatch(/Cancel/);
    expect(src).toMatch(/emailVerified/);
    expect(src).toMatch(/lock-closed-outline/);
    expect(src).toMatch(/toggleInterest/);
    expect(src).toMatch(/handleDobChange/);
    expect(src).not.toMatch(/placesApi|authApi/);
  });

  it('uses a consistent two-column grid and equal-width language/bio columns', () => {
    expect(src).toMatch(/styles\.row/);
    expect(src).toMatch(/styles\.col/);
    expect(src).toMatch(/flex: 1,\s*minWidth: 0/);
    expect(src).not.toMatch(/flex: 1\.5/);
  });

  it('keeps gender selection, interests, and city/state pickers working', () => {
    expect(src).toMatch(/prefer_not/);
    expect(src).toMatch(/TRAVEL_INTERESTS\.map/);
    expect(src).toMatch(/INDIAN_CITIES_BY_STATE/);
    expect(src).toMatch(/LANGUAGE_OPTIONS/);
    expect(src).toMatch(/Alert\.alert\('Select state first'/);
  });
});
