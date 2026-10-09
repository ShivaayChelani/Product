import fs from 'fs';
import path from 'path';
import {
  reelEditorActions,
  resolveReelEditorMode,
  toEditorReelPayload,
} from '../features/creator/utils/reelEditorMode';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('Reel editor mode and actions', () => {
  it('create mode shows Post + Save as Draft, not Save Changes', () => {
    const actions = reelEditorActions(resolveReelEditorMode({}));
    expect(actions.title).toBe('Create Moment');
    expect(actions.showSaveAsDraft).toBe(true);
    expect(actions.showHeaderPost).toBe(true);
    expect(actions.headerActionLabel).toBe('Post');
    expect(actions.primaryActionLabel).toBe('Post Moment');
  });

  it('draft Save Changes publishes the same draft and still offers Save as Draft', () => {
    const actions = reelEditorActions(
      resolveReelEditorMode({
        editReel: { id: 'draft_1', status: 'DRAFT' },
        editorMode: 'draft',
      }),
    );
    expect(actions.title).toBe('Edit Moment');
    expect(actions.showSaveAsDraft).toBe(true);
    expect(actions.showHeaderPost).toBe(true);
    expect(actions.headerActionLabel).toBe('Save Changes');
    expect(actions.primaryActionLabel).toBe('Save Changes');
  });

  it('published edit mode shows Save Changes only — no Post and no Save as Draft', () => {
    const actions = reelEditorActions(
      resolveReelEditorMode({
        editReel: { id: 'live_1', status: 'APPROVED' },
        editorMode: 'published',
      }),
    );
    expect(actions.showSaveAsDraft).toBe(false);
    expect(actions.showHeaderPost).toBe(false);
    expect(actions.primaryActionLabel).toBe('Save Changes');
  });

  it('does not infer draft from a missing status on an existing reel', () => {
    expect(
      resolveReelEditorMode({ editReel: { id: 'live_1' } }),
    ).toBe('published');
  });

  it('uses the explicit editorMode from navigation, not caption or media URL', () => {
    expect(
      resolveReelEditorMode({
        editReel: {
          id: 'live_1',
          status: 'APPROVED',
          description: 'Draft vibes',
          videoUrl: 'https://cdn.example/posted.mp4',
        },
        editorMode: 'published',
      }),
    ).toBe('published');
  });

  it('passes reel id and status into the editor payload', () => {
    const payload = toEditorReelPayload(
      {
        id: 'r1',
        status: 'APPROVED',
        videoUrl: 'https://cdn.example/r1.mp4',
        title: 'Taj',
        description: 'Sunset',
        tags: ['heritage'],
        placeId: 'p1',
      },
      'published',
    );
    expect(payload).toMatchObject({
      id: 'r1',
      status: 'APPROVED',
      videoUrl: 'https://cdn.example/r1.mp4',
    });
  });
});

describe('CreateReel / studio wiring', () => {
  const createSrc = read('screens/CreateReelScreen.tsx');
  const reelsSrc = read('screens/CreatorReelsScreen.tsx');
  const navigatorSrc = read('navigation/RootNavigator.tsx');

  it('CreateReel posts new reels and saves drafts through distinct APIs', () => {
    expect(createSrc).toMatch(/creatorUploadManager\.startReelUpload/);
    expect(createSrc).toMatch(/creatorApi\.saveDraft/);
    expect(createSrc).toMatch(/creatorApi\.publishDraft/);
    expect(createSrc).toMatch(/socialApi\.updateReel/);
    expect(createSrc).toMatch(/invalidateReelSurfaces\(queryClient\)/);
    expect(createSrc).toMatch(/if \(submitLockRef\.current\) return;/);
  });

  it('does not call saveDraft for a published reel', () => {
    expect(createSrc).toMatch(/if \(isPublishedEdit \|\| editorMode === 'collab'\)/);
    expect(createSrc).toMatch(/Cannot save as draft/);
    expect(createSrc).toMatch(/showSaveAsDraft/);
  });

  it('posts an existing draft by updating the same id then publishDraft', () => {
    expect(createSrc).toMatch(/isDraftEdit && editReel\?\.id/);
    expect(createSrc).toMatch(/publishDraft: isDraftEdit && Boolean\(editReel\?\.id\)/);
    expect(createSrc).toMatch(/await creatorApi\.publishDraft\(String\(editReel\.id\)\)/);
  });

  it('navigation into the editor passes reel id, status, and editorMode', () => {
    expect(reelsSrc).toMatch(/toEditorReelPayload/);
    expect(reelsSrc).toMatch(/editorMode/);
    expect(reelsSrc).toMatch(/tab === 'DRAFT' \? 'draft' : 'published'/);
    expect(navigatorSrc).toMatch(/editorMode=\{route\.params\?\.editorMode\}/);
  });

  it('successful transitions invalidate draft, creator, vendor, and public reel lists', () => {
    const helper = read('features/creator/utils/invalidateReelSurfaces.ts');
    expect(helper).toMatch(/vendor-reels/);
    expect(helper).toMatch(/\['creator', 'dashboard'\]/);
    expect(helper).toMatch(/travelSocialQueryKeys\.reelsFeed/);
    expect(helper).toMatch(/export function invalidateReelSurfaces/);
  });
});
