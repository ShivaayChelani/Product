import { rideLauncher } from '../providers/RideLauncher';
import type { LaunchTarget, RideLaunchPayload } from '../providers/types';
import type { RideOpenResponse } from '../../../services/api/rides';

export type { LaunchTarget };

export async function openProviderApp(response: RideOpenResponse, target: LaunchTarget = 'app'): Promise<void> {
  const payload: RideLaunchPayload = {
    provider: response.provider,
    deepLink: response.deepLink,
    webFallbackLink: response.webFallbackLink,
    playStore: response.playStore,
    appStore: response.appStore,
  };
  await rideLauncher.launch(payload, target);
}
