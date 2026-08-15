import fs from 'fs';
import path from 'path';

describe('Creator upload copy and draft wiring', () => {
  it('BecomeCreator uses mobile tap-to-upload copy, not drag-and-drop', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/BecomeCreatorScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/Tap to upload images\/videos/);
    expect(src).not.toMatch(/Drag & drop files here/);
    expect(src).toMatch(/pickPortfolio/);
    expect(src).toMatch(/portfolioLinks/);
    expect(src).toMatch(/uploadApi\.uploadImage/);
    expect(src).toMatch(/remoteUrl/);
    expect(src).toMatch(/maxWidth: 1920/);
  });

  it('CreateReel saves drafts through the creator API instead of a fake alert', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/CreateReelScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/creatorApi\.saveDraft/);
    expect(src).toMatch(/creatorApi\.publishDraft/);
    expect(src).not.toMatch(/Saved to drafts/);
    expect(src).not.toMatch(/No drafts yet/);
  });
});
