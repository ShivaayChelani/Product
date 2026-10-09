export type ReelEditorMode = 'create' | 'draft' | 'published' | 'collab';

const DRAFT_LIKE_STATUSES = new Set(['DRAFT', 'HIDDEN']);

export function normalizeReelStatus(status: unknown): string {
  return String(status ?? '').trim().toUpperCase();
}

export function isDraftLikeStatus(status: unknown): boolean {
  return DRAFT_LIKE_STATUSES.has(normalizeReelStatus(status));
}

export function resolveReelEditorMode(params: {
  editReel?: { id?: unknown; status?: unknown } | null;
  editorMode?: string | null;
  collaborationId?: string | null;
  revisionNote?: string | null;
}): ReelEditorMode {
  if (params.collaborationId && params.revisionNote) return 'collab';

  const hasExistingReel = Boolean(params.editReel?.id);
  const explicit = String(params.editorMode || '').trim().toLowerCase();
  if (explicit === 'collab') return 'collab';
  if (explicit === 'draft' && hasExistingReel) return 'draft';
  if (explicit === 'published' && hasExistingReel) return 'published';
  if (explicit === 'create' && !hasExistingReel) return 'create';

  if (!hasExistingReel) return 'create';
  if (isDraftLikeStatus(params.editReel?.status)) return 'draft';
  return 'published';
}

export type EditorReelPayload = {
  id: string;
  status: string;
  videoUrl?: string | null;
  thumbnail?: string | null;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  placeId?: string | null;
  vendorId?: string | null;
  place?: { id?: string; name?: string } | null;
  vendor?: { id?: string; businessName?: string } | null;
};

export function toEditorReelPayload(
  reel: Record<string, unknown>,
  editorMode?: ReelEditorMode,
): EditorReelPayload {
  const status =
    normalizeReelStatus(reel.status) || (editorMode === 'draft' ? 'DRAFT' : 'APPROVED');
  const place = reel.place as EditorReelPayload['place'] | undefined;
  const vendor = reel.vendor as EditorReelPayload['vendor'] | undefined;
  return {
    id: String(reel.id),
    status,
    videoUrl: typeof reel.videoUrl === 'string' ? reel.videoUrl : null,
    thumbnail: typeof reel.thumbnail === 'string' ? reel.thumbnail : null,
    title: typeof reel.title === 'string' ? reel.title : null,
    description: typeof reel.description === 'string' ? reel.description : null,
    tags: Array.isArray(reel.tags) ? reel.tags.map(String) : [],
    placeId: reel.placeId == null ? null : String(reel.placeId),
    vendorId: reel.vendorId == null ? null : String(reel.vendorId),
    place: place && typeof place === 'object' ? place : null,
    vendor: vendor && typeof vendor === 'object' ? vendor : null,
  };
}

export function reelEditorActions(mode: ReelEditorMode) {
  const showSaveAsDraft = mode === 'create' || mode === 'draft';
  const showHeaderPost = mode === 'create' || mode === 'draft' || mode === 'collab';
  return {
    showSaveAsDraft,
    showHeaderPost,
    headerActionLabel:
      mode === 'collab' ? 'Resubmit' : mode === 'draft' ? 'Save Changes' : 'Post',
    primaryActionLabel:
      mode === 'collab'
        ? 'Resubmit to Vendor'
        : mode === 'published' || mode === 'draft'
          ? 'Save Changes'
          : 'Post Moment',
    title:
      mode === 'create' ? 'Create Moment' : mode === 'collab' ? 'Revise Moment' : 'Edit Moment',
    subtitle:
      mode === 'create'
        ? 'Share your moments with PalSafar'
        : mode === 'collab'
          ? 'Update your Moment and resubmit to the vendor'
          : mode === 'draft'
            ? 'Finish your draft, then tap Post'
            : 'Update your Moment details',
  };
}
