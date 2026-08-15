import { detectReelMediaKind, isStaticImageUrl } from '../services/reels/reelMediaKind';
import { navigateToWorkspaceHome } from '../navigation/workspaceHome';

describe('reel media kind', () => {
  it('detects photos vs videos from mime and filename', () => {
    expect(detectReelMediaKind('image/jpeg', 'file:///a.jpg', 'a.jpg')).toBe('image');
    expect(detectReelMediaKind('video/mp4', 'file:///a.mp4', 'a.mp4')).toBe('video');
    expect(isStaticImageUrl('https://res.cloudinary.com/demo/image/upload/v1/x.jpg')).toBe(true);
    expect(isStaticImageUrl('https://res.cloudinary.com/demo/video/upload/v1/x.mp4')).toBe(false);
  });
});

describe('workspace home navigation', () => {
  it('sends creator and vendor users to their main tabs', () => {
    const navigate = jest.fn();
    navigateToWorkspaceHome({ navigate }, 'CREATOR');
    expect(navigate).toHaveBeenCalledWith('CreatorTabs', { screen: 'Dashboard' });
    navigateToWorkspaceHome({ navigate }, 'VENDOR');
    expect(navigate).toHaveBeenCalledWith('VendorTabs', { screen: 'Home' });
  });
});
