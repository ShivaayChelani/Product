import fs from 'fs';
import path from 'path';

const dash = fs.readFileSync(
  path.join(__dirname, '../screens/CreatorDashboardScreen.tsx'),
  'utf8',
);
const creatorService = fs.readFileSync(
  path.join(__dirname, '../../server/src/modules/creator/creator.service.ts'),
  'utf8',
);
const socialService = fs.readFileSync(
  path.join(__dirname, '../../server/src/modules/social/social.service.ts'),
  'utf8',
);
const validation = fs.readFileSync(
  path.join(__dirname, '../../server/src/modules/creator/creator.validation.ts'),
  'utf8',
);

describe('Creator dashboard and My Reels load without nested 500s', () => {
  it('does not load the studio dashboard through getCreatorDashboard', () => {
    const dashboardFn = creatorService.slice(
      creatorService.indexOf('async getDashboard'),
      creatorService.indexOf('async getAnalytics'),
    );
    expect(dashboardFn).toContain('prisma.reel.count');
    expect(dashboardFn).toContain('prisma.reel.aggregate');
    expect(dashboardFn).not.toContain('getCreatorDashboard(');
  });

  it('lists creator reels with an explicit select instead of a nested collaboration include', () => {
    expect(creatorService).toMatch(/async listReels/);
    expect(creatorService).toMatch(/select:\s*\{/);
    expect(creatorService).toMatch(/toPositiveInt/);
    expect(creatorService).not.toMatch(/include:\s*\{[\s\S]*collaboration:/);
  });

  it('allows the mobile cache-bust query param on /creator/reels', () => {
    expect(validation).toMatch(/_t:\s*z\.string\(\)\.optional\(\)/);
  });

  it('keeps recent-reel reads shallow so a bad collaboration row cannot 500 the studio', () => {
    expect(socialService).toMatch(/creatorReelListSelect/);
    expect(socialService).toMatch(/loadCreatorReelList/);
    const includeBlock = socialService.slice(
      socialService.indexOf('const reelResponseInclude'),
      socialService.indexOf('export const creatorReelListSelect'),
    );
    const collabBlock = includeBlock.slice(
      includeBlock.indexOf('collaboration:'),
      includeBlock.indexOf('event:'),
    );
    expect(collabBlock).toMatch(/campaignTitle: true/);
    expect(collabBlock).not.toMatch(/vendor:/);
    expect(collabBlock).not.toMatch(/creator:/);
  });

  it('shows the API error on the dashboard instead of a blank generic screen only', () => {
    expect(dash).toMatch(/dashboardQuery\.error/);
    expect(dash).toMatch(/Try again/);
  });
});
