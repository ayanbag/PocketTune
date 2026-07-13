/**
 * Soft-keyboard height in dp (0 when hidden), from Keyboard events.
 *
 * With targetSdk 35+ Android enforces edge-to-edge, which kills both
 * adjustResize and RN's KeyboardAvoidingView frame math — the window never
 * resizes, so avoidance must be done by hand: the app container pads its
 * bottom by exactly this height.
 */
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const subs = [
      // willShow fires on iOS only; didShow covers Android.
      Keyboard.addListener('keyboardWillShow', e => setHeight(e.endCoordinates.height)),
      Keyboard.addListener('keyboardDidShow', e => setHeight(e.endCoordinates.height)),
      Keyboard.addListener('keyboardWillHide', () => setHeight(0)),
      Keyboard.addListener('keyboardDidHide', () => setHeight(0)),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);
  return height;
}
