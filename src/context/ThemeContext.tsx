import React, { createContext, useState, useContext, useEffect } from 'react';
import { useColorScheme, StatusBarStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define theme colors
export const lightTheme = {
  background: '#f5f5f5',
  surface: '#ffffff',
  primary: '#2196F3',
  secondary: '#4CAF50',
  text: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  border: '#e0e0e0',
  borderLight: '#f0f0f0',
  card: '#ffffff',
  cardBorder: '#e0e0e0',
  statusBar: 'dark-content' as StatusBarStyle,
  tabBar: '#ffffff',
  tabBarActive: '#2196F3',
  tabBarInactive: '#666666',
  switchTrackFalse: '#ddd',
  switchTrackTrue: '#81c784',
  switchThumbFalse: '#f5f5f5',
  switchThumbTrue: '#4caf50',
  icon: '#666666',
  iconSecondary: '#999999',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
};

export const darkTheme = {
  background: '#121212',
  surface: '#1e1e1e',
  primary: '#2196F3',
  secondary: '#4CAF50',
  text: '#f5f5f5',
  textSecondary: '#bbbbbb',
  textTertiary: '#888888',
  border: '#333333',
  borderLight: '#2c2c2c',
  card: '#1e1e1e',
  cardBorder: '#333333',
  statusBar: 'light-content' as StatusBarStyle,
  tabBar: '#1e1e1e',
  tabBarActive: '#2196F3',
  tabBarInactive: '#bbbbbb',
  switchTrackFalse: '#555555',
  switchTrackTrue: '#81c784',
  switchThumbFalse: '#bbbbbb',
  switchThumbTrue: '#4caf50',
  icon: '#bbbbbb',
  iconSecondary: '#888888',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
};

export type Theme = typeof lightTheme;

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setDarkMode: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: lightTheme,
  isDark: false,
  toggleTheme: () => {},
  setDarkMode: () => {},
});

const THEME_PREFERENCE_KEY = '@theme_preference';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceTheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        if (savedTheme !== null) {
          setIsDark(savedTheme === 'dark');
        } else {
          // If no saved preference, use device theme
          setIsDark(deviceTheme === 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }
    };

    loadThemePreference();
  }, [deviceTheme]);

  // Save theme preference when it changes
  useEffect(() => {
    const saveThemePreference = async () => {
      try {
        await AsyncStorage.setItem(THEME_PREFERENCE_KEY, isDark ? 'dark' : 'light');
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    };

    saveThemePreference();
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const setDarkMode = (value: boolean) => {
    setIsDark(value);
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext); 