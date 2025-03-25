import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Dimensions, ViewStyle, TextStyle } from 'react-native';
// Using mock LineChart until we can install the package
// import { LineChart } from 'react-native-chart-kit';
import { 
    getLorcanaPriceHistory, 
    getLorcanaPriceHistoryStats, 
    LorcanaPriceHistoryEntry, 
    LorcanaPriceHistoryStats 
} from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';

// Mock LineChart component until we can install the package
const LineChart = ({ data, width, height, chartConfig, bezier, style, fromZero, yAxisLabel, formatYLabel }: any) => (
    <View style={[{ width, height, backgroundColor: '#eee', borderRadius: 8 }, style]}>
        <Text style={{ textAlign: 'center', paddingTop: 100 }}>
            Chart will appear after installing react-native-chart-kit
        </Text>
    </View>
);

interface LorcanaPriceDetailsProps {
    cardId: string;
    cardName: string;
}

export const LorcanaPriceDetails: React.FC<LorcanaPriceDetailsProps> = ({ cardId, cardName }) => {
    const { theme, isDark } = useTheme();
    const styles = useStyles();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [priceHistory, setPriceHistory] = useState<LorcanaPriceHistoryEntry[]>([]);
    const [priceStats, setPriceStats] = useState<LorcanaPriceHistoryStats | null>(null);

    useEffect(() => {
        loadPriceData();
    }, [cardId]);

    const loadPriceData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Load price history and stats in parallel
            const [history, stats] = await Promise.all([
                getLorcanaPriceHistory(cardId),
                getLorcanaPriceHistoryStats(cardId)
            ]);

            setPriceHistory(history);
            setPriceStats(stats);
        } catch (err) {
            console.error('Error loading Lorcana price data:', err);
            setError('Failed to load price data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (price: string | number | null): string => {
        if (price === null || price === undefined) return 'N/A';
        const numPrice = typeof price === 'string' ? parseFloat(price) : price;
        return numPrice ? `$${numPrice.toFixed(2)}` : 'N/A';
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

    const renderPriceChart = () => {
        if (priceHistory.length < 2) {
            return (
                <View style={styles.chartPlaceholder}>
                    <Text style={styles.placeholderText}>Not enough price data available</Text>
                    <Text style={styles.placeholderSubText}>Price history will appear as more data is collected</Text>
                </View>
            );
        }

        // Sort history by date, oldest first
        const sortedHistory = [...priceHistory].sort((a, b) => 
            new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
        );

        // Prepare data for chart
        const normalPrices = sortedHistory.map(entry => 
            entry.usd ? parseFloat(entry.usd) : 0
        );
        
        const foilPrices = sortedHistory.map(entry => 
            entry.usd_foil ? parseFloat(entry.usd_foil) : 0
        );
        
        const labels = sortedHistory.map(entry => 
            new Date(entry.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );

        // Only show a reasonable number of labels to prevent overlap
        const skipLabels = Math.max(1, Math.floor(labels.length / 6));
        const filteredLabels = labels.filter((_, i) => i % skipLabels === 0);

        const chartWidth = Dimensions.get('window').width - 40;

        const chartData = {
            labels: filteredLabels,
            datasets: [
                {
                    data: normalPrices,
                    color: (opacity = 1) => `rgba(54, 162, 235, ${opacity})`,
                    strokeWidth: 2
                },
                {
                    data: foilPrices,
                    color: (opacity = 1) => `rgba(153, 102, 255, ${opacity})`,
                    strokeWidth: 2
                }
            ],
            legend: ['Normal', 'Foil']
        };

        const chartConfig = {
            backgroundGradientFrom: theme.surface,
            backgroundGradientTo: theme.surface,
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(${isDark ? '255, 255, 255' : '0, 0, 0'}, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(${isDark ? '255, 255, 255' : '0, 0, 0'}, ${opacity})`,
            style: {
                borderRadius: 16
            },
            propsForDots: {
                r: '4',
                strokeWidth: '1',
                stroke: theme.surface
            }
        };

        return (
            <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Price History</Text>
                <LineChart
                    data={chartData}
                    width={chartWidth}
                    height={220}
                    chartConfig={chartConfig}
                    bezier
                    style={styles.chart}
                    fromZero
                    yAxisLabel="$"
                    formatYLabel={(value: string) => `$${parseFloat(value).toFixed(1)}`}
                />
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
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
            
            {renderPriceChart()}
            
            <View style={styles.statsContainer}>
                <Text style={styles.sectionTitle}>Price Statistics</Text>
                
                <View style={styles.statRow}>
                    <View style={styles.statColumn}>
                        <Text style={styles.statLabel}>Normal Price</Text>
                        <Text style={styles.statValue}>
                            {priceHistory.length > 0 ? formatPrice(priceHistory[0].usd) : 'N/A'}
                        </Text>
                    </View>
                    <View style={styles.statColumn}>
                        <Text style={styles.statLabel}>Foil Price</Text>
                        <Text style={styles.statValue}>
                            {priceHistory.length > 0 ? formatPrice(priceHistory[0].usd_foil) : 'N/A'}
                        </Text>
                    </View>
                </View>
                
                {priceStats && (
                    <>
                        <View style={styles.divider} />
                        
                        <View style={styles.statRow}>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>7-Day Change</Text>
                                <Text style={[
                                    styles.statValue, 
                                    priceStats.priceChange7d > 0 ? styles.positive : 
                                    priceStats.priceChange7d < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(priceStats.priceChange7d)}
                                </Text>
                            </View>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>7-Day Foil Change</Text>
                                <Text style={[
                                    styles.statValue, 
                                    priceStats.foilPriceChange7d > 0 ? styles.positive : 
                                    priceStats.foilPriceChange7d < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(priceStats.foilPriceChange7d)}
                                </Text>
                            </View>
                        </View>
                        
                        <View style={styles.statRow}>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>30-Day Change</Text>
                                <Text style={[
                                    styles.statValue, 
                                    priceStats.priceChange30d > 0 ? styles.positive : 
                                    priceStats.priceChange30d < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(priceStats.priceChange30d)}
                                </Text>
                            </View>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>30-Day Foil Change</Text>
                                <Text style={[
                                    styles.statValue, 
                                    priceStats.foilPriceChange30d > 0 ? styles.positive : 
                                    priceStats.foilPriceChange30d < 0 ? styles.negative : null
                                ]}>
                                    {formatPercentage(priceStats.foilPriceChange30d)}
                                </Text>
                            </View>
                        </View>
                        
                        <View style={styles.divider} />
                        
                        <View style={styles.statRow}>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Min Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.minPrice)}</Text>
                            </View>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Min Foil Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.minFoilPrice)}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.statRow}>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Max Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.maxPrice)}</Text>
                            </View>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Max Foil Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.maxFoilPrice)}</Text>
                            </View>
                        </View>
                        
                        <View style={styles.statRow}>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Avg Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.avgPrice)}</Text>
                            </View>
                            <View style={styles.statColumn}>
                                <Text style={styles.statLabel}>Avg Foil Price</Text>
                                <Text style={styles.statValue}>{formatPrice(priceStats.avgFoilPrice)}</Text>
                            </View>
                        </View>
                    </>
                )}
            </View>
            
            <View style={styles.historyContainer}>
                <Text style={styles.sectionTitle}>Price History</Text>
                {priceHistory.length === 0 ? (
                    <Text style={styles.noDataText}>No price history available</Text>
                ) : (
                    priceHistory.map((entry, index) => (
                        <View key={index} style={styles.historyItem}>
                            <Text style={styles.historyDate}>{formatDate(entry.recorded_at)}</Text>
                            <View style={styles.historyPrices}>
                                <Text style={styles.historyPrice}>Normal: {formatPrice(entry.usd)}</Text>
                                <Text style={styles.historyPrice}>Foil: {formatPrice(entry.usd_foil)}</Text>
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
};

const useStyles = () => useThemedStyles((theme) => ({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: theme.background,
    } as ViewStyle,
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
    cardName: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 16,
        color: theme.text,
        textAlign: 'center',
    } as TextStyle,
    chartContainer: {
        marginVertical: 16,
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    } as ViewStyle,
    chartTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
        color: theme.text,
        textAlign: 'center',
    } as TextStyle,
    chart: {
        marginVertical: 8,
        borderRadius: 12,
    } as ViewStyle,
    chartPlaceholder: {
        height: 220,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
    } as ViewStyle,
    placeholderText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.textSecondary,
    } as TextStyle,
    placeholderSubText: {
        fontSize: 14,
        color: theme.textTertiary,
        marginTop: 8,
        textAlign: 'center',
    } as TextStyle,
    statsContainer: {
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    } as ViewStyle,
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: theme.text,
    } as TextStyle,
    statRow: {
        flexDirection: 'row',
        marginBottom: 16,
    } as ViewStyle,
    statColumn: {
        flex: 1,
    } as ViewStyle,
    statLabel: {
        fontSize: 14,
        color: theme.textSecondary,
        marginBottom: 4,
    } as TextStyle,
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.text,
    } as TextStyle,
    positive: {
        color: theme.success,
    } as TextStyle,
    negative: {
        color: theme.error,
    } as TextStyle,
    divider: {
        height: 1,
        backgroundColor: theme.border,
        marginVertical: 12,
    } as ViewStyle,
    historyContainer: {
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    } as ViewStyle,
    noDataText: {
        fontSize: 16,
        color: theme.textSecondary,
        textAlign: 'center',
        marginVertical: 24,
    } as TextStyle,
    historyItem: {
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        paddingVertical: 12,
    } as ViewStyle,
    historyDate: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 4,
    } as TextStyle,
    historyPrices: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    } as ViewStyle,
    historyPrice: {
        fontSize: 14,
        color: theme.textSecondary,
    } as TextStyle,
})); 