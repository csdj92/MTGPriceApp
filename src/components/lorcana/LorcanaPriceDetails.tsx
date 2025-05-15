import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Dimensions, ViewStyle, TextStyle } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { 
    getLorcanaPriceHistory, 
    getLorcanaPriceHistoryStats, 
    LorcanaPriceHistoryEntry, 
    LorcanaPriceHistoryStats 
} from '../../services/LorcanaService';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import { formatCurrency } from '../../utils/formatters';

interface LorcanaPriceDetailsProps {
    cardId: string;
    cardName: string;
    currentPrice: string | null;
    currentFoilPrice: string | null;
}

export const LorcanaPriceDetails: React.FC<LorcanaPriceDetailsProps> = ({ cardId, cardName, currentPrice, currentFoilPrice }) => {
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

    const formatChartData = (data: LorcanaPriceHistoryEntry[]) => {
        const normalPrices = data
            .filter(entry => entry.usd !== null)
            .map(entry => ({
                value: parseFloat(entry.usd || '0'),
                date: new Date(entry.recorded_at),
                label: formatCurrency(entry.usd || '0')
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        const foilPrices = data
            .filter(entry => entry.usd_foil !== null)
            .map(entry => ({
                value: parseFloat(entry.usd_foil || '0'),
                date: new Date(entry.recorded_at),
                label: formatCurrency(entry.usd_foil || '0')
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        return {
            normalData: normalPrices.map((item, index) => ({
                value: item.value,
                dataPointText: index === normalPrices.length - 1 ? item.label : '',
                label: item.date.toLocaleDateString(),
                dataPointRadius: 5,
                showDataPoint: index === normalPrices.length - 1
            })),
            foilData: foilPrices.map((item, index) => ({
                value: item.value,
                dataPointText: index === foilPrices.length - 1 ? item.label : '',
                label: item.date.toLocaleDateString(),
                dataPointRadius: 5,
                showDataPoint: index === foilPrices.length - 1
            }))
        };
    };

    const chartData = formatChartData(priceHistory);
    const maxValue = Math.max(
        ...chartData.normalData.map(d => d.value),
        ...chartData.foilData.map(d => d.value)
    );

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
            
            <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Price History</Text>
                <LineChart
                    areaChart
                    data={chartData.normalData}
                    data2={chartData.foilData}
                    height={200}
                    width={Dimensions.get('window').width - 40}
                    noOfSections={5}
                    maxValue={maxValue * 1.1}
                    yAxisLabelSuffix="$"
                    yAxisTextStyle={{ color: isDark ? '#fff' : '#000' }}
                    xAxisLabelTextStyle={{ color: isDark ? '#fff' : '#000' }}
                    color="#2196F3"
                    color2="#9C27B0"
                    textColor={isDark ? '#fff' : '#000'}
                    dataPointsColor="#2196F3"
                    dataPointsColor2="#9C27B0"
                    startFillColor="rgba(33, 150, 243, 0.3)"
                    startFillColor2="rgba(156, 39, 176, 0.3)"
                    curved
                    spacing={40}
                    initialSpacing={20}
                    endSpacing={20}
                    backgroundColor={isDark ? '#1a1a1a' : '#fff'}
                    rulesColor={isDark ? '#333' : '#e0e0e0'}
                    rulesType="solid"
                    showVerticalLines
                    verticalLinesColor={isDark ? '#333' : '#e0e0e0'}
                />
            </View>
            
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
                    <Text style={[styles.legendText, isDark && styles.darkText]}>Normal</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: '#9C27B0' }]} />
                    <Text style={[styles.legendText, isDark && styles.darkText]}>Foil</Text>
                </View>
            </View>
            
            <View style={styles.currentPrices}>
                <Text style={[styles.priceLabel, isDark && styles.darkText]}>
                    Current Price: {formatCurrency(currentPrice || '0')}
                </Text>
                <Text style={[styles.priceLabel, isDark && styles.darkText]}>
                    Current Foil: {formatCurrency(currentFoilPrice || '0')}
                </Text>
            </View>
            
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
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
        gap: 20,
    } as ViewStyle,
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    } as ViewStyle,
    legendColor: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 5,
    } as ViewStyle,
    legendText: {
        fontSize: 14,
    } as TextStyle,
    currentPrices: {
        marginTop: 15,
        alignItems: 'center',
    } as ViewStyle,
    priceLabel: {
        fontSize: 16,
        marginVertical: 2,
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
    darkText: {
        color: '#fff',
    } as TextStyle,
})); 