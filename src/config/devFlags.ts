export const DEV_FLAGS = {
  SHOW_DEV_GPS_PANEL: __DEV__,
  SHOW_ADMIN_ACCESS: __DEV__,
  SHOW_PARTNER_ACCESS: __DEV__,
  ENABLE_MANUAL_REDEMPTION_CODE: __DEV__,
  USE_SERVER_API: true,
  /**
   * Closed beta: hit the local Express API (must be running on :5000).
   * Android physical phone → LOCAL_API_HOST (LAN IP of your PC)
   * Android emulator → use 10.0.2.2 as LOCAL_API_HOST
   * iOS Simulator → leave LOCAL_API_HOST empty (defaults to localhost) or set LAN IP
   * Physical iPhone → LOCAL_API_HOST (LAN IP of your Mac/PC) — never localhost
   */
  USE_LOCAL_API: false,
  /**
   * Host for local API when USE_LOCAL_API is true.
   * Android emulator: '10.0.2.2'
   * iOS Simulator: '' (localhost) or your LAN IP
   * Physical phone (Android/iOS): your machine LAN IP (e.g. 192.168.1.9)
   */
  LOCAL_API_HOST: '192.168.1.9',
  /** When true (dev only), always show onboarding after splash so you can re-test the flow. */
  FORCE_SHOW_ONBOARDING: true,
};
