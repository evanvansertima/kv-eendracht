import { useWindowDimensions } from 'react-native';

/**
 * Drives the difference between the phone and desktop shells.
 *
 * One codebase serves iOS, Android and web (ADR-0002), but a tournament draw reviewed on
 * a 6-inch screen and the same draw on a 27-inch monitor are not the same interface.
 * Screens branch on this rather than on Platform.OS: a tablet in landscape should get the
 * wide layout, and a narrow browser window should get the phone one.
 */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

export function useBreakpoint(): {
  breakpoint: Breakpoint;
  isWide: boolean;
  width: number;
} {
  const { width } = useWindowDimensions();
  const breakpoint: Breakpoint = width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'phone';
  return { breakpoint, isWide: width >= 768, width };
}
