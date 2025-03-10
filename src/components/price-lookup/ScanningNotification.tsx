import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

interface ScanningNotificationProps {
  isVisible: boolean;
  cardName: string;
  isNewToCollection: boolean;
  setCode?: string;
}

/**
 * Shows a notification during scanning when a card is detected
 * Highlights when the card is new to the collection
 */
const ScanningNotification: React.FC<ScanningNotificationProps> = ({
  isVisible,
  cardName,
  isNewToCollection,
  setCode
}) => {
  const [animatedOpacity] = useState(new Animated.Value(0));
  const [animatedScale] = useState(new Animated.Value(0.9));

  useEffect(() => {
    if (isVisible) {
      // Fade in with scale effect
      Animated.parallel([
        Animated.timing(animatedOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(animatedScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.elastic(1.1),
        })
      ]).start();
    } else {
      // Fade out
      Animated.timing(animatedOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }).start(() => {
        // Reset scale when hidden
        animatedScale.setValue(0.9);
      });
    }
  }, [isVisible, animatedOpacity, animatedScale]);

  if (!isVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          opacity: animatedOpacity,
          transform: [{ scale: animatedScale }]
        }
      ]}
    >
      <View style={[styles.card, isNewToCollection && styles.newCard]}>
        <View style={styles.cardContent}>
          <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="tail">
            {cardName}
          </Text>
          
          {isNewToCollection ? (
            <View style={styles.newBadge}>
              <Icon name="plus-circle" size={16} color="#FFF" style={styles.icon} />
              <Text style={styles.newText}>
                {setCode ? `New to ${setCode}` : 'New to Collection'}
              </Text>
            </View>
          ) : (
            <View style={styles.existingBadge}>
              <Icon name="check-circle" size={16} color="#FFF" style={styles.icon} />
              <Text style={styles.existingText}>
                Already in Collection
              </Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 5,
    padding: 16,
  },
  card: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '100%',
    minWidth: '75%',
    borderWidth: 2,
    borderColor: '#444',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  newCard: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  cardContent: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  cardName: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 120,
    justifyContent: 'center',
  },
  existingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 120,
    justifyContent: 'center',
  },
  icon: {
    marginRight: 6,
  },
  newText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  existingText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default memo(ScanningNotification); 