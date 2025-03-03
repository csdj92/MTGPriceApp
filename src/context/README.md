# Theme System Documentation

This document explains how to use the theme system in the MTG Price App.

## Overview

The theme system provides a consistent way to apply light and dark themes across the application. It uses React Context to share theme information with all components.

## Key Components

1. **ThemeContext**: Provides theme data and functions to toggle between light and dark mode.
2. **useTheme**: A custom hook to access the theme context.
3. **useThemedStyles**: A utility hook to create themed styles.

## How to Use

### Basic Usage

To use the theme in a component:

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const MyComponent = () => {
  const { theme } = useTheme();
  
  return (
    <View style={{ backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>Hello World</Text>
    </View>
  );
};
```

### Using the useThemedStyles Hook

For more complex components, use the `useThemedStyles` hook:

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import useThemedStyles from '../hooks/useThemedStyles';

const MyComponent = () => {
  const styles = useStyles();
  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello World</Text>
    </View>
  );
};

const useStyles = () => useThemedStyles((theme) => ({
  container: {
    backgroundColor: theme.background,
    padding: 16,
  },
  text: {
    color: theme.text,
    fontSize: 16,
  },
}));
```

### Toggling Dark Mode

To toggle dark mode programmatically:

```tsx
import { useTheme } from '../context/ThemeContext';

const MyComponent = () => {
  const { toggleTheme, isDark } = useTheme();
  
  return (
    <Button 
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"} 
      onPress={toggleTheme} 
    />
  );
};
```

### Setting Dark Mode Directly

To set dark mode to a specific value:

```tsx
import { useTheme } from '../context/ThemeContext';

const MyComponent = () => {
  const { setDarkMode } = useTheme();
  
  return (
    <>
      <Button title="Light Mode" onPress={() => setDarkMode(false)} />
      <Button title="Dark Mode" onPress={() => setDarkMode(true)} />
    </>
  );
};
```

## Available Theme Properties

The theme object contains the following properties:

- `background`: Main background color
- `surface`: Surface/card background color
- `primary`: Primary brand color
- `secondary`: Secondary brand color
- `text`: Primary text color
- `textSecondary`: Secondary text color
- `textTertiary`: Tertiary text color
- `border`: Border color
- `borderLight`: Light border color
- `card`: Card background color
- `cardBorder`: Card border color
- `statusBar`: Status bar style ('light-content' or 'dark-content')
- `tabBar`: Tab bar background color
- `tabBarActive`: Active tab color
- `tabBarInactive`: Inactive tab color
- `switchTrackFalse`: Switch track color when off
- `switchTrackTrue`: Switch track color when on
- `switchThumbFalse`: Switch thumb color when off
- `switchThumbTrue`: Switch thumb color when on
- `icon`: Icon color
- `iconSecondary`: Secondary icon color
- `success`: Success color
- `error`: Error color
- `warning`: Warning color
- `info`: Info color

## Best Practices

1. Always use theme colors instead of hardcoded colors
2. Use the `useThemedStyles` hook for complex components
3. Group related styles together
4. Use semantic color names (e.g., `theme.text` instead of `theme.white`)
5. Test your UI in both light and dark modes 