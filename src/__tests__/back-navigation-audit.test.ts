import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function allSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      allSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Back navigation audit', () => {
  it('every BackHandler subscription is removed on unmount and returns a boolean', () => {
    const files = allSourceFiles(SRC).filter(f => /BackHandler\.addEventListener/.test(fs.readFileSync(f, 'utf8')));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      // Registered handler must be cleaned up in the same effect/file.
      expect(src).toMatch(/\.remove\(\)/);
      // A consumed hardware-Back must either navigate or intentionally return true/false.
      expect(src).toMatch(/return (true|false);/);
      expect(src).not.toMatch(/BackHandler\.addEventListener\('hardwareBackPress', \(\) => \{\s*\}/);
    }
  });

  it('closeReelScreen never hard-navigates Home when a previous screen exists', () => {
    const util = read('src/features/travelSocial/utils/closeReelScreen.ts');
    expect(util).toMatch(/if \(navigation\.canGoBack\(\)\) \{/);
    expect(util).toMatch(/navigation\.goBack\(\);/);
    // navigate(fallback) must only run on the no-back-stack deep-link path.
    const goBack = util.indexOf('goBack');
    const fallback = util.indexOf('navigate(fallback)');
    expect(goBack).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(goBack);
  });

  it('no screen performs an unconditional top-level navigate("Home") that skips the previous screen', () => {
    const files = allSourceFiles(SRC).filter(f => /navigation\.navigate\(('|")Home('|")/.test(fs.readFileSync(f, 'utf8')));
    expect(files.map(f => path.relative(ROOT, f))).toEqual([]);
  });

  it('shells are keyed by workspace mode so Back after switching lands on the new shell initial route', () => {
    const root = read('src/navigation/RootNavigator.tsx');
    for (const key of ['"user-shell"', '"vendor-shell"', '"creator-shell"', '"admin-shell"']) {
      expect(root).toContain(key);
    }
    expect(root).toMatch(/function resolveShellMode/);
  });

  it('every transparent in-screen Modal dismisses via Android onRequestClose', () => {
    const checks: Array<[string, string, string]> = [
      ['src/screens/AddHiddenGemScreen.tsx', 'visible={categoryModalVisible}', 'setCategoryModalVisible(false)'],
      ['src/screens/AddHiddenGemScreen.tsx', 'visible={timeModalVisible}', 'setTimeModalVisible(false)'],
      ['src/features/buildTrip/components/TripBuilderLoadedView.tsx', 'visible={!!durationModal}', 'setDurationModal(null)'],
      ['src/screens/TripDetailScreen.tsx', 'visible={!!noteModal}', 'setNoteModal(null)'],
    ];
    for (const [file, visible, close] of checks) {
      const src = read(file);
      const start = src.indexOf(visible);
      expect(start).toBeGreaterThan(-1);
      const tag = src.slice(start, start + 500);
      expect(tag).toMatch(/onRequestClose=/);
      expect(tag).toContain(close);
    }
  });
});