import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  ScrollView 
} from 'react-native';
import { ServiceFactory } from '../services/ServiceFactory';
import { PriceHistoryEntry, PriceHistoryStats } from '../services/price/PriceService';

interface PriceDetailsProps {
  cardUuid: string;
  cardName: string;
}

export const PriceDetails: React.FC<PriceDetailsProps> = ({ cardUuid, cardName }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [priceStats, setPriceStats] = useState<PriceHistoryStats | null>(null);

  useEffect(() => {
    loadPriceData();
  }, [cardUuid]);

  const loadPriceData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Initialize services if not already initialized
      if (!ServiceFactory.isInitialized()) {
        await ServiceFactory.initialize();
      }

      // Get the price service
      const priceService = ServiceFactory.getPriceService();

      // Load price history and stats in parallel
      const [history, stats] = await Promise.all([
        priceService.getCardPriceHistory(cardUuid),
        priceService.getCardPriceHistoryStats(cardUuid)
      ]);

      setPriceHistory(history);
      setPriceStats(stats);
    } catch (err) {
      console.error('Error loading price data:', err);
      setError('Failed to load price data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number): string => {
    return price ? `$${price.toFixed(2)}` : 'N/A';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatPercentage = (value: number): string => {
    return value ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '0%';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#5637DD" />
        <Text style={styles.loadingText}>Loading price data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.cardName}>{cardName}</Text>
      
      {priceStats && (
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Price Summary</Text>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Current Price:</Text>
            <Text style={styles.priceValue}>{formatPrice(priceHistory[0]?.normal || 0)}</Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Current Foil Price:</Text>
            <Text style={styles.priceValue}>{formatPrice(priceHistory[0]?.foil || 0)}</Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>7-Day Change:</Text>
            <Text style={[
              styles.priceValue, 
              { color: priceStats.priceChange7d > 0 ? 'green' : priceStats.priceChange7d < 0 ? 'red' : 'black' }
            ]}>
              {formatPercentage(priceStats.priceChange7d)}
            </Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>30-Day Change:</Text>
            <Text style={[
              styles.priceValue, 
              { color: priceStats.priceChange30d > 0 ? 'green' : priceStats.priceChange30d < 0 ? 'red' : 'black' }
            ]}>
              {formatPercentage(priceStats.priceChange30d)}
            </Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>All-Time High:</Text>
            <Text style={styles.priceValue}>{formatPrice(priceStats.maxPrice)}</Text>
          </View>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>All-Time Low:</Text>
            <Text style={styles.priceValue}>{formatPrice(priceStats.minPrice)}</Text>
          </View>
        </View>
      )}
      
      {priceHistory.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Price History</Text>
          {priceHistory.map((entry, index) => (
            <View key={`${entry.date}-${index}`} style={styles.historyItem}>
              <Text style={styles.historyDate}>{formatDate(entry.date)}</Text>
              <View style={styles.historyPrices}>
                <Text style={styles.historyPrice}>Normal: {formatPrice(entry.normal)}</Text>
                <Text style={styles.historyPrice}>Foil: {formatPrice(entry.foil)}</Text>
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.noDataText}>No price history available for this card.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
  },
  cardName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#444',
  },
  statsContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  priceLabel: {
    fontSize: 15,
    color: '#666',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  historyItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  historyDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  historyPrices: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyPrice: {
    fontSize: 14,
    color: '#333',
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
}); 