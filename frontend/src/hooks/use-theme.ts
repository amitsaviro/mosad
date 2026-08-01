/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // scheme can be 'light', 'dark', null, or undefined depending on
  // platform — anything that isn't explicitly 'dark' falls back to 'light'.
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
