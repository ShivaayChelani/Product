import fs from 'fs';
import path from 'path';

describe('Collaboration request details', () => {
  it('does not show payment, budget, or view earnings on the request details screen', () => {
    const screen = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationDetailScreen.tsx'),
      'utf8',
    );
    const widgets = fs.readFileSync(
      path.join(__dirname, '../features/creator/components/CollaborationDetailWidgets.tsx'),
      'utf8',
    );

    expect(widgets).not.toMatch(/label: 'Payment'/);
    expect(widgets).not.toMatch(/View Earnings/);
    expect(widgets).not.toMatch(/onViewEarnings/);
    expect(widgets).toMatch(/label: 'Approval'/);
    expect(widgets).toMatch(/View Content/);

    expect(screen).not.toMatch(/onViewEarnings/);
    expect(screen).not.toMatch(/View Earnings/);
    expect(screen).not.toMatch(/cardLabel}>Budget/);
    expect(screen).not.toMatch(/Campaign Duration/);
    expect(screen).toMatch(/Request Details/);
  });

  it('shows Pending after a collaboration reel is submitted', () => {
    const widgets = fs.readFileSync(
      path.join(__dirname, '../features/creator/components/CollaborationDetailWidgets.tsx'),
      'utf8',
    );
    const screen = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationDetailScreen.tsx'),
      'utf8',
    );
    expect(widgets).toMatch(/effectiveCollaborationStatus/);
    expect(widgets).toMatch(/>Pending</);
    expect(widgets).toMatch(/hasSubmittedReel/);
    expect(screen).toMatch(/markInProgress/);
    expect(screen).toMatch(/hasSubmittedReel=\{Boolean\(item\.reel\?\.id\)\}/);
  });

  it('lets the vendor request changes with a clear minimum feedback length', () => {
    const review = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationReviewScreen.tsx'),
      'utf8',
    );
    expect(review).toMatch(/MIN_REVISION_FEEDBACK/);
    expect(review).toMatch(/requestChanges/);
    expect(review).toMatch(/Add more detail/);
    expect(review).not.toMatch(/disabled=\{acting \|\| feedback\.trim\(\)\.length < 10\}/);
  });

  it('lets the creator edit and resubmit after the vendor requests changes', () => {
    const widgets = fs.readFileSync(
      path.join(__dirname, '../features/creator/components/CollaborationDetailWidgets.tsx'),
      'utf8',
    );
    const screen = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationDetailScreen.tsx'),
      'utf8',
    );
    const create = fs.readFileSync(
      path.join(__dirname, '../screens/CreateReelScreen.tsx'),
      'utf8',
    );
    expect(widgets).toMatch(/Edit & Resubmit/);
    expect(widgets).toMatch(/effective === 'REVISION_REQUESTED'/);
    expect(screen).toMatch(/Vendor requested changes/);
    expect(screen).toMatch(/revisionNote/);
    expect(screen).toMatch(/prefillMediaUri/);
    expect(create).toMatch(/Revise Reel/);
    expect(create).toMatch(/Resubmit to Vendor/);
  });

  it('lets the creator publish after the vendor approves', () => {
    const widgets = fs.readFileSync(
      path.join(__dirname, '../features/creator/components/CollaborationDetailWidgets.tsx'),
      'utf8',
    );
    const screen = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationDetailScreen.tsx'),
      'utf8',
    );
    const review = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationReviewScreen.tsx'),
      'utf8',
    );
    const api = fs.readFileSync(
      path.join(__dirname, '../services/api/collaborations.ts'),
      'utf8',
    );
    expect(review).toMatch(/>Approve</);
    expect(review).not.toMatch(/Approve & Publish/);
    expect(widgets).toMatch(/Publish Reel/);
    expect(widgets).toMatch(/onPublishReel/);
    expect(screen).toMatch(/publishReel/);
    expect(screen).toMatch(/Vendor approved your reel/);
    expect(api).toMatch(/publish-reel/);
  });

  it('requires an active vendor subscription before sending a collaboration request', () => {
    const requestScreen = fs.readFileSync(
      path.join(__dirname, '../screens/CollaborationRequestScreen.tsx'),
      'utf8',
    );
    const profile = fs.readFileSync(
      path.join(__dirname, '../features/travelSocial/screens/ViewCreatorProfileScreen.tsx'),
      'utf8',
    );
    expect(requestScreen).toMatch(/PLAN_LIMIT_REACHED/);
    expect(requestScreen).toMatch(/VendorSubscription/);
    expect(profile).toMatch(/needsSubscription/);
    expect(profile).toMatch(/VendorSubscription/);
  });
});
