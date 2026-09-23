import { useEffect, useRef, useCallback } from 'react';
import { BackHandler, Keyboard } from 'react-native';

/**
 * Android hardware back must dismiss an open keyboard first instead of
 * navigating away from an input screen. Pair with `dismissThenNavigate` for
 * on-screen back buttons so both paths behave the same way.
 */
export function useBackDismissesKeyboard(): {
  dismissThenNavigate: (navigate: () => void) => void;
} {
  const kbVisibleRef = useRef(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      kbVisibleRef.current = true;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbVisibleRef.current = false;
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (kbVisibleRef.current) {
        Keyboard.dismiss();
        return true;
      }
      return false;
    });
    return () => {
      show.remove();
      hide.remove();
      back.remove();
    };
  }, []);

  const dismissThenNavigate = useCallback((navigate: () => void) => {
    if (kbVisibleRef.current) {
      Keyboard.dismiss();
      return;
    }
    navigate();
  }, []);

  return { dismissThenNavigate };
}
