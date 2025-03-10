import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any;

interface NewToCollectionLabelProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  showIcon?: boolean;
  setCode?: string;
}

/**
 * A component that displays a label for cards that are new to a collection
 */
const NewToCollectionLabel: React.FC<NewToCollectionLabelProps> = ({
  containerStyle,
  textStyle,
  showIcon = true,
  setCode
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {showIcon && <Icon name="plus-circle" size={16} color="#FFFFFF" style={styles.icon} />}
      <Text style={[styles.label, textStyle]}>
        {setCode ? `New to ${setCode}` : 'New to Collection'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  icon: {
    marginRight: 4,
  },
  label: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default NewToCollectionLabel; 