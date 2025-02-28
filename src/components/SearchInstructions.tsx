import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type SearchInstructionsProps = {
  visible: boolean;
};

// Memoize the component to prevent unnecessary re-renders
const SearchInstructions: React.FC<SearchInstructionsProps> = memo(({ visible }) => {
  if (!visible) return null;
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search Tips:</Text>
      <View style={styles.instructionItem}>
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.text}>Just type the card name (e.g. "Lightning Bolt")</Text>
      </View>
      <View style={styles.instructionItem}>
        <Text style={styles.label}>Type:</Text>
        <Text style={styles.text}>Use t: prefix (e.g. "t:creature")</Text>
      </View>
      <View style={styles.instructionItem}>
        <Text style={styles.label}>Text:</Text>
        <Text style={styles.text}>Use o: prefix (e.g. "o:flying")</Text>
      </View>
      <View style={styles.instructionItem}>
        <Text style={styles.label}>Color:</Text>
        <Text style={styles.text}>Use c: prefix (e.g. "c:r" for red, "c:wu" for white-blue)</Text>
      </View>
      <View style={styles.instructionItem}>
        <Text style={styles.label}>Keyword:</Text>
        <Text style={styles.text}>Use k: prefix (e.g. "k:flash")</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f9ff',
    padding: 16,
    margin: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0e1f9',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2962ff',
  },
  instructionItem: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  label: {
    width: 60,
    fontWeight: 'bold',
    color: '#4a4a4a',
  },
  text: {
    flex: 1,
    color: '#666',
  },
});

export default SearchInstructions; 