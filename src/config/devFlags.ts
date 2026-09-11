export const DEV_FLAGS = {
  SHOW_DEV_GPS_PANEL: __DEV__,
  SHOW_ADMIN_ACCESS: __DEV__,
  SHOW_PARTNER_ACCESS: __DEV__,
  ENABLE_MANUAL_REDEMPTION_CODE: __DEV__,
  USE_SERVER_API: true,
  /**
   * API target for DEBUG builds (npx react-native run-android / react-native start).
   *
   *   'production' (default) → https://product-jiet.onrender.com/api/v1
   *                            Release builds ALWAYS use the production API.
   *                            Debug builds use it too unless overridden below.
   *   'local'                → http://<LOCAL_API_HOST>:3000/api/v1
   *                            (your dev box — Express API must be running on :3000)
   *
   * If you hit login/forgot-password timeouts from `run-android`, the debug
   * build was probably resolving to the local API. Keep 'production' to test
   * against the live Render API; switch to 'local' only when developing against
   * the local Express server.
   */
  API_TARGET: 'production' as 'production' | 'local',
  /**
   * Host for the local API when API_TARGET is 'local'.
   * Android emulator: '10.0.2.2' | iOS Simulator: '' (localhost) | Physical phone: your LAN IP
   */
  LOCAL_API_HOST: '192.168.1.9',
  /** When true (dev only), always show onboarding after splash so you can re-test the flow. */
  FORCE_SHOW_ONBOARDING: true,
};
