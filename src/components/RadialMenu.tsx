import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';

const RADIAL_MENU_RADIUS = 100;
const ITEM_SIZE = 50;

interface RadialMenuItem {
  onPress: () => void;
  render?: () => React.ReactNode;
}

interface RadialMenuProps {
  items: RadialMenuItem[];
}

const RadialMenu: React.FC<RadialMenuProps> = ({ items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const animations = useRef(items.map(() => new Animated.Value(0))).current;

  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    const animateItems = items.map((_, index) => {
      return Animated.spring(animations[index], {
        toValue: isOpen ? 1 : 0,
        useNativeDriver: true,
        friction: 5,
      });
    });
    Animated.stagger(50, animateItems).start();
  }, [isOpen, animations, items]);

  const renderItems = () => {
    return items.map((item, index) => {
      const angle = (index / items.length) * (2 * Math.PI) - Math.PI / 2;
      const x = RADIAL_MENU_RADIUS * Math.cos(angle);
      const y = RADIAL_MENU_RADIUS * Math.sin(angle);

      const translateX = animations[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, x],
      });
      const translateY = animations[index].interpolate({
        inputRange: [0, 1],
        outputRange: [0, y],
      });

      return (
        <Animated.View
          key={index}
          style={[
            styles.menuItem,
            {
              transform: [
                { translateX },
                { translateY },
                { scale: animations[index] },
              ],
            },
          ]}
        >
          <TouchableOpacity onPress={item.onPress}>
            {item.render ? (
              item.render()
            ) : (
              <View style={styles.itemContent} />
            )}
          </TouchableOpacity>
        </Animated.View>
      );
    });
  };

  return (
    <View style={styles.container}>
      {renderItems()}
      <TouchableOpacity onPress={toggleMenu} style={styles.mainButton}>
        <View style={styles.buttonContent} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 100,
    alignItems: 'center',
    justifyContent: 'center',

  },
  mainButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  buttonContent: {
    width: 40,
    height: 40,
    backgroundColor: '#2980b9',
    borderRadius: 20,
  },
  menuItem: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    width: 30,
    height: 30,
    backgroundColor: '#c0392b',
    borderRadius: 15,
  },
});

export default RadialMenu; 