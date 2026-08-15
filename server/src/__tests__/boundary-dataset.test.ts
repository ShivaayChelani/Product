import { describe, expect, it } from 'vitest';
import { boundaryDatasetProvider } from '../modules/canonical/services/boundary-dataset.provider';

describe('boundaryDatasetProvider', () => {
  it('stays in bbox-only mode without license acknowledgement', () => {
    const status = boundaryDatasetProvider.getStatus();
    expect(status.loaded).toBe(false);
    expect(status.licenseAcknowledged).toBe(false);
  });

  it('does not fabricate polygon membership without datasets', () => {
    const r = boundaryDatasetProvider.resolveAdministrative(77.2, 28.6, 'Delhi', 'New Delhi');
    expect(r.pendingDataset).toBe(true);
    expect(r.stateValid).toBeNull();
  });
});
