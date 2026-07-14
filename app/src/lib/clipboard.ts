/**
 * Clipboard access without a new native dependency.
 *
 * React Native still ships its original Clipboard module; only the re-export on
 * the `react-native` index is deprecated (accessing it prints a warning that
 * would show up as a LogBox badge mid-demo). Requiring the module directly is
 * the same code, minus the warning.
 */
const Clipboard = require('react-native/Libraries/Components/Clipboard/Clipboard')
  .default as { setString(content: string): void; getString(): Promise<string> };

export function copyToClipboard(text: string): void {
  Clipboard.setString(text);
}
