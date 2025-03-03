import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';

/**
 * A custom hook that creates themed styles
 * 
 * @param styleCreator A function that takes the current theme and returns a style object
 * @returns The created styles
 * 
 * @example
 * // Define your styles
 * const useStyles = () => useThemedStyles((theme) => ({
 *   container: {
 *     backgroundColor: theme.background,
 *     flex: 1,
 *   },
 *   text: {
 *     color: theme.text,
 *     fontSize: 16,
 *   },
 * }));
 * 
 * // In your component
 * const MyComponent = () => {
 *   const styles = useStyles();
 *   return (
 *     <View style={styles.container}>
 *       <Text style={styles.text}>Hello World</Text>
 *     </View>
 *   );
 * };
 */
export function useThemedStyles<T>(
  styleCreator: (theme: Theme) => T
): T {
  const { theme } = useTheme();
  
  return useMemo(() => {
    return StyleSheet.create(styleCreator(theme) as any);
  }, [theme, styleCreator]);
}

export default useThemedStyles; 