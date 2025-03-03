import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import useThemedStyles from '../hooks/useThemedStyles';

interface ThemedCardProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  titleStyle?: TextStyle;
}

const ThemedCard: React.FC<ThemedCardProps> = ({ title, children, style, titleStyle }) => {
  const styles = useStyles();

  return (
    <View style={[styles.card, style]}>
      {title && <Text style={[styles.title as TextStyle, titleStyle]}>{title}</Text>}
      {children}
    </View>
  );
};

const useStyles = () => useThemedStyles((theme) => ({
  card: {
    backgroundColor: theme.card,
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
}));

export default ThemedCard; 