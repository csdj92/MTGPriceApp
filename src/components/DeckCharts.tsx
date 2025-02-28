import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { ExtendedCard } from '../types/card';

interface DeckChartsProps {
  deck: ExtendedCard[];
}

type ColorKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'M';

const DeckCharts: React.FC<DeckChartsProps> = ({ deck }) => {
  // Calculate mana distribution data
  const manaDistribution = useMemo(() => {
    const distribution = Array(8).fill(0); // 0-7+ mana costs
    
    deck.forEach(card => {
      // Calculate CMC from manaCost
      let cmc = 0;
      if (card.manaCost) {
        // Remove brackets and calculate
        const manaCost = card.manaCost.replace(/[{}]/g, '');
        const numericValue = parseInt(manaCost);
        if (!isNaN(numericValue)) {
          cmc = numericValue;
        } else {
          // Count each symbol as 1
          const symbols = manaCost.split('');
          cmc = symbols.length;
        }
      } else if (card.cmc !== undefined) {
        cmc = Math.floor(card.cmc);
      }
      
      // Group 7+ costs together
      const index = Math.min(cmc, 7);
      distribution[index]++;
    });
    
    return distribution;
  }, [deck]);
  
  // Calculate power curve data (for creatures)
  const powerCurve = useMemo(() => {
    const curve = Array(7).fill(0); // 0-6+ power
    
    deck.forEach(card => {
      // Check if card is a creature (contains "Creature" in type)
      if (card.type && card.type.includes('Creature') && card.power) {
        let power = parseInt(card.power);
        // Handle special cases like "*" or "1+*"
        if (isNaN(power)) {
          power = card.power === '*' ? 0 : 1; // Assign * as power 0, and others as 1
        }
        // Group 6+ power together
        const index = Math.min(power, 6);
        curve[index]++;
      }
    });
    
    return curve;
  }, [deck]);
  
  // Calculate the maximum value to scale bars appropriately
  const maxManaValue = Math.max(...manaDistribution, 1);
  const maxPowerValue = Math.max(...powerCurve, 1);
  
  // Calculate color distribution
  const colorDistribution = useMemo(() => {
    const colors: Record<ColorKey, number> = {
      W: 0, // White
      U: 0, // Blue
      B: 0, // Black
      R: 0, // Red
      G: 0, // Green
      C: 0, // Colorless
      M: 0, // Multicolor
    };
    
    deck.forEach(card => {
      if (card.colorIdentity && card.colorIdentity.length > 1) {
        colors.M++;
      } else if (card.colorIdentity && card.colorIdentity.length === 1) {
        const color = card.colorIdentity[0] as ColorKey;
        if (color in colors) {
          colors[color]++;
        } else {
          colors.C++; // Default to colorless if not recognized
        }
      } else {
        colors.C++;
      }
    });
    
    return colors;
  }, [deck]);
  
  // Get color for the bars
  const getColorForMana = (index: number): string => {
    switch (index) {
      case 0: return '#e0e0e0'; // 0 mana
      case 1: return '#a4d1a2'; // 1 mana
      case 2: return '#7fc17c'; // 2 mana
      case 3: return '#5fb15a'; // 3 mana
      case 4: return '#429a3f'; // 4 mana
      case 5: return '#2a7c27'; // 5 mana
      case 6: return '#1b661a'; // 6 mana
      case 7: return '#0a4f09'; // 7+ mana
      default: return '#e0e0e0';
    }
  };
  
  const getColorForPower = (index: number): string => {
    switch (index) {
      case 0: return '#e0e0e0'; // 0 power
      case 1: return '#ffcccb'; // 1 power
      case 2: return '#ff9999'; // 2 power
      case 3: return '#ff6666'; // 3 power
      case 4: return '#ff3333'; // 4 power
      case 5: return '#e60000'; // 5 power
      case 6: return '#990000'; // 6+ power
      default: return '#e0e0e0';
    }
  };
  
  const getColorForIdentity = (color: ColorKey): string => {
    const colorMap: Record<ColorKey, string> = {
      W: '#F8E7B9', // White
      U: '#B3CEEA', // Blue
      B: '#B0AFAE', // Black
      R: '#EAA7A7', // Red
      G: '#B7C4B9', // Green
      C: '#E5E5E5', // Colorless
      M: '#FFD700', // Multicolor (gold)
    };
    return colorMap[color];
  };
  
  const getColorNameForIdentity = (color: ColorKey): string => {
    const colorMap: Record<ColorKey, string> = {
      W: 'White',
      U: 'Blue',
      B: 'Black',
      R: 'Red',
      G: 'Green',
      C: 'Colorless',
      M: 'Multi',
    };
    return colorMap[color];
  };
  
  const colorKeys = Object.keys(colorDistribution) as Array<ColorKey>;
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deck Analytics</Text>
      
      {/* Mana Curve Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mana Curve</Text>
        <View style={styles.chartContainer}>
          {manaDistribution.map((count, index) => (
            <View key={`mana-${index}`} style={styles.barContainer}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    height: Math.max((count / maxManaValue) * 120, 2),
                    backgroundColor: getColorForMana(index)
                  }
                ]}
              />
              <Text style={styles.barLabel}>
                {index < 7 ? index : '7+'}
              </Text>
              <Text style={styles.barValue}>{count}</Text>
            </View>
          ))}
        </View>
      </View>
      
      {/* Power Curve Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Creature Power</Text>
        <View style={styles.chartContainer}>
          {powerCurve.map((count, index) => (
            <View key={`power-${index}`} style={styles.barContainer}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    height: Math.max((count / maxPowerValue) * 120, 2),
                    backgroundColor: getColorForPower(index)
                  }
                ]}
              />
              <Text style={styles.barLabel}>
                {index < 6 ? index : '6+'}
              </Text>
              <Text style={styles.barValue}>{count}</Text>
            </View>
          ))}
        </View>
      </View>
      
      {/* Color Distribution */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Color Distribution</Text>
        <View style={styles.colorChartContainer}>
          {colorKeys.map((color) => (
            colorDistribution[color] > 0 ? (
              <View key={`color-${color}`} style={styles.colorBarContainer}>
                <View style={styles.colorLabelContainer}>
                  <View 
                    style={[
                      styles.colorDot, 
                      { backgroundColor: getColorForIdentity(color) }
                    ]} 
                  />
                  <Text style={styles.colorLabel}>{getColorNameForIdentity(color)}</Text>
                </View>
                <View style={styles.colorBarWrapper}>
                  <View 
                    style={[
                      styles.colorBar, 
                      { 
                        width: `${(colorDistribution[color] / deck.length) * 100}%`,
                        backgroundColor: getColorForIdentity(color)
                      }
                    ]}
                  />
                </View>
                <Text style={styles.colorValue}>{colorDistribution[color]}</Text>
              </View>
            ) : null
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    marginHorizontal: 4,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 3,
  },
  bar: {
    width: '100%',
    minWidth: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  barValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
  },
  colorChartContainer: {
    marginTop: 8,
  },
  colorBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  colorLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  colorLabel: {
    fontSize: 12,
    color: '#555',
  },
  colorBarWrapper: {
    flex: 1,
    height: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 7,
    overflow: 'hidden',
    marginHorizontal: 6,
  },
  colorBar: {
    height: '100%',
  },
  colorValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    width: 24,
    textAlign: 'right',
  },
});

export default DeckCharts; 