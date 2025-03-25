import React, { useEffect, useState } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    ActivityIndicator, 
    FlatList, 
    TouchableOpacity, 
    Image,
    ViewStyle,
    TextStyle,
    ImageStyle 
} from 'react-native';
import { getLorcanaSignificantPriceChanges } from '../../services/LorcanaService';
import { LorcanaCard } from '../../types/lorcana';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';

interface LorcanaMoversAndShakersProps {
    timeframe?: '7d' | '30d';
    limit?: number;
    minChangePercent?: number;
    onCardPress?: (card: LorcanaCard) => void;
}

export const LorcanaMoversAndShakers: React.FC<LorcanaMoversAndShakersProps> = ({ 
    timeframe = '7d', 
    limit = 10,
    minChangePercent = 10,
    onCardPress
}) => {
    const { theme } = useTheme();
    const styles = useStyles();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [priceChanges, setPriceChanges] = useState<{card: LorcanaCard, priceChange: number, foilPriceChange: number}[]>([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState<'7d' | '30d'>(timeframe);

    useEffect(() => {
        loadPriceChanges();
    }, [selectedTimeframe, limit, minChangePercent]);

    const loadPriceChanges = async () => {
        try {
            setLoading(true);
            setError(null);

            const changes = await getLorcanaSignificantPriceChanges(
                selectedTimeframe,
                limit,
                minChangePercent
            );

            setPriceChanges(changes);
        } catch (err) {
            console.error('Error loading price changes:', err);
            setError('Failed to load price change data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (price: string | number | null): string => {
        if (price === null || price === undefined) return 'N/A';
        const numPrice = typeof price === 'string' ? parseFloat(price) : price;
        return numPrice ? `$${numPrice.toFixed(2)}` : 'N/A';
    };

    const formatPercentage = (value: number): string => {
        return value ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '0%';
    };

    const renderCard = ({ item }: { item: {card: LorcanaCard, priceChange: number, foilPriceChange: number} }) => {
        const { card, priceChange, foilPriceChange } = item;
        const maxChange = Math.max(Math.abs(priceChange), Math.abs(foilPriceChange));
        const isPositive = 
            (Math.abs(priceChange) > Math.abs(foilPriceChange) && priceChange > 0) || 
            (Math.abs(foilPriceChange) > Math.abs(priceChange) && foilPriceChange > 0);

        return (
            <TouchableOpacity 
                style={styles.card} 
                onPress={() => onCardPress?.(card)}
                activeOpacity={0.7}
            >
                <View style={styles.cardRow}>
                    <View style={styles.imageContainer}>
                        {card.Image ? (
                            <Image source={{ uri: card.Image }} style={styles.cardImage} />
                        ) : (
                            <View style={styles.placeholderImage}>
                                <Text style={styles.placeholderText}>No Image</Text>
                            </View>
                        )}
                    </View>
                    
                    <View style={styles.cardDetails}>
                        <Text style={styles.cardName} numberOfLines={2}>{card.Name}</Text>
                        <Text style={styles.cardSubDetails}>{card.Set_Name} • {card.Rarity}</Text>
                        
                        <View style={styles.priceRow}>
                            <View style={styles.priceColumn}>
                                <Text style={styles.priceLabel}>Normal</Text>
                                <Text style={styles.priceValue}>{formatPrice(card.price_usd || null)}</Text>
                                <Text style={[
                                    styles.changeValue, 
                                    priceChange > 0 ? styles.positive : 
                                    priceChange < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(priceChange)}
                                </Text>
                            </View>
                            
                            <View style={styles.priceColumn}>
                                <Text style={styles.priceLabel}>Foil</Text>
                                <Text style={styles.priceValue}>{formatPrice(card.price_usd_foil || null)}</Text>
                                <Text style={[
                                    styles.changeValue, 
                                    foilPriceChange > 0 ? styles.positive : 
                                    foilPriceChange < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(foilPriceChange)}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
                
                <View style={[
                    styles.changeIndicator, 
                    isPositive ? styles.positiveIndicator : styles.negativeIndicator
                ]}>
                    <Text style={styles.changeIndicatorText}>
                        {isPositive ? '↑' : '↓'} {Math.abs(maxChange).toFixed(1)}%
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderTimeframeSelector = () => (
        <View style={styles.timeframeContainer}>
            <TouchableOpacity
                style={[
                    styles.timeframeButton,
                    selectedTimeframe === '7d' ? styles.selectedTimeframe : null
                ]}
                onPress={() => setSelectedTimeframe('7d')}
            >
                <Text style={[
                    styles.timeframeText,
                    selectedTimeframe === '7d' ? styles.selectedTimeframeText : null
                ]}>
                    7 Days
                </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
                style={[
                    styles.timeframeButton,
                    selectedTimeframe === '30d' ? styles.selectedTimeframe : null
                ]}
                onPress={() => setSelectedTimeframe('30d')}
            >
                <Text style={[
                    styles.timeframeText,
                    selectedTimeframe === '30d' ? styles.selectedTimeframeText : null
                ]}>
                    30 Days
                </Text>
            </TouchableOpacity>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={styles.loadingText}>Loading price changes...</Text>
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
        <View style={styles.container}>
            <Text style={styles.title}>Lorcana Price Movers</Text>
            
            {renderTimeframeSelector()}
            
            {priceChanges.length === 0 ? (
                <View style={styles.noDataContainer}>
                    <Text style={styles.noDataText}>No significant price changes found.</Text>
                    <Text style={styles.noDataSubText}>
                        Price changes will appear here once more data is collected.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={priceChanges}
                    renderItem={renderCard}
                    keyExtractor={(item, index) => `${item.card.Unique_ID}-${index}`}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={5}
                />
            )}
        </View>
    );
};

const useStyles = () => useThemedStyles((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    } as ViewStyle,
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginVertical: 16,
        color: theme.text,
        textAlign: 'center',
    } as TextStyle,
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    } as ViewStyle,
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: theme.textSecondary,
    } as TextStyle,
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    } as ViewStyle,
    errorText: {
        color: theme.error,
        fontSize: 16,
        textAlign: 'center',
    } as TextStyle,
    timeframeContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 16,
        backgroundColor: theme.surface,
        marginHorizontal: 16,
        borderRadius: 8,
        overflow: 'hidden',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
    } as ViewStyle,
    timeframeButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
    } as ViewStyle,
    selectedTimeframe: {
        backgroundColor: theme.primary,
    } as ViewStyle,
    timeframeText: {
        color: theme.textSecondary,
        fontWeight: '500',
        fontSize: 14,
    } as TextStyle,
    selectedTimeframeText: {
        color: '#fff',
    } as TextStyle,
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    } as ViewStyle,
    card: {
        backgroundColor: theme.surface,
        borderRadius: 12,
        marginBottom: 16,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        position: 'relative',
        overflow: 'hidden',
    } as ViewStyle,
    cardRow: {
        flexDirection: 'row',
    } as ViewStyle,
    imageContainer: {
        width: 80,
        height: 112,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: 16,
    } as ViewStyle,
    cardImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    } as ImageStyle,
    placeholderImage: {
        width: '100%',
        height: '100%',
        backgroundColor: theme.borderLight,
        justifyContent: 'center',
        alignItems: 'center',
    } as ViewStyle,
    placeholderText: {
        color: theme.textSecondary,
        fontSize: 12,
    } as TextStyle,
    cardDetails: {
        flex: 1,
    } as ViewStyle,
    cardName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 4,
    } as TextStyle,
    cardSubDetails: {
        fontSize: 14,
        color: theme.textSecondary,
        marginBottom: 8,
    } as TextStyle,
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    } as ViewStyle,
    priceColumn: {
        flex: 1,
    } as ViewStyle,
    priceLabel: {
        fontSize: 12,
        color: theme.textSecondary,
    } as TextStyle,
    priceValue: {
        fontSize: 15,
        fontWeight: 'bold',
        color: theme.text,
    } as TextStyle,
    changeValue: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: 2,
    } as TextStyle,
    positive: {
        color: theme.success,
    } as TextStyle,
    negative: {
        color: theme.error,
    } as TextStyle,
    changeIndicator: {
        position: 'absolute',
        top: 12,
        right: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    } as ViewStyle,
    positiveIndicator: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
    } as ViewStyle,
    negativeIndicator: {
        backgroundColor: 'rgba(244, 67, 54, 0.15)',
    } as ViewStyle,
    changeIndicatorText: {
        fontWeight: 'bold',
        fontSize: 13,
    } as TextStyle,
    noDataContainer: {
        flex: 1,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    } as ViewStyle,
    noDataText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.textSecondary,
        textAlign: 'center',
    } as TextStyle,
    noDataSubText: {
        fontSize: 14,
        color: theme.textTertiary,
        textAlign: 'center',
        marginTop: 8,
    } as TextStyle,
})); 