import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ActivityIndicator, LayoutChangeEvent, ViewStyle, TextStyle } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { 
    getLorcanaPriceHistory, 
    getLorcanaPriceHistoryStats, 
    LorcanaPriceHistoryEntry, 
    LorcanaPriceHistoryStats, 
    getLorcanaCardApiTimestamp,
    setLorcanaCardApiTimestamp
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

interface PriceStatisticsProps {
    latestNormalPrice: string | null;
    latestFoilPrice: string | null;
    priceStats: LorcanaPriceHistoryStats | null;
    formatPrice: (price: string | number | null) => string;
    formatPercentage: (value: number) => string;
    styles: ReturnType<typeof useStyles>;
}

const PriceStatistics: React.FC<PriceStatisticsProps> = React.memo(({
    latestNormalPrice,
    latestFoilPrice,
    priceStats,
    formatPrice,
    formatPercentage,
    styles,
}) => {
    if (!priceStats) {
        return null;
    }

    return (
        <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Price Statistics</Text>
            
            <View style={styles.divider} />
            
            <View style={styles.statRow}>
                <View style={styles.statColumn}>
                    <Text style={styles.statLabel}>Latest Recorded Normal</Text>
                    <Text style={styles.statValue}>
                        {formatPrice(latestNormalPrice)}
                    </Text>
                </View>
                <View style={styles.statColumn}>
                    <Text style={styles.statLabel}>Latest Recorded Foil</Text>
                    <Text style={styles.statValue}>
                        {formatPrice(latestFoilPrice)}
                    </Text>
                </View>
            </View>
            
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
        </View>
    );
});

interface PriceHistoryTableProps {
    priceHistory: LorcanaPriceHistoryEntry[];
    formatDate: (dateString: string) => string;
    formatPrice: (price: string | number | null) => string;
    styles: ReturnType<typeof useStyles>;
}

const PriceHistoryTable: React.FC<PriceHistoryTableProps> = React.memo(({
    priceHistory,
    formatDate,
    formatPrice,
    styles,
}) => {
    if (priceHistory.length === 0) {
        return (
            <View style={styles.historyContainer}>
                <Text style={styles.sectionTitle}>Price History</Text>
                <Text style={styles.noDataText}>No price history available</Text>
            </View>
        );
    }

    return (
        <View style={styles.historyContainer}>
            <Text style={styles.sectionTitle}>Price History</Text>
            {priceHistory.map((entry, index) => (
                <View key={index} style={styles.historyItem}>
                    <Text style={styles.historyDate}>{formatDate(entry.recorded_at)}</Text>
                    <View style={styles.historyPrices}>
                        <Text style={styles.historyPrice}>Normal: {formatPrice(entry.usd)}</Text>
                        <Text style={styles.historyPrice}>Foil: {formatPrice(entry.usd_foil)}</Text>
                    </View>
                </View>
            ))}
        </View>
    );
});

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const LorcanaPriceDetails: React.FC<LorcanaPriceDetailsProps> = React.memo(({ cardId, cardName, currentPrice, currentFoilPrice }) => {
    const { theme, isDark } = useTheme();
    const styles = useStyles();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [priceHistory, setPriceHistory] = useState<LorcanaPriceHistoryEntry[]>([]);
    const [priceStats, setPriceStats] = useState<LorcanaPriceHistoryStats | null>(null);
    const [chartContainerWidth, setChartContainerWidth] = useState(0);

    const onChartContainerLayout = useCallback((e: LayoutChangeEvent) => {
        // chartContainer has padding: 16 on each side, so subtract 32
        setChartContainerWidth(e.nativeEvent.layout.width - 32);
    }, []);

    useEffect(() => {
        const performLoad = async () => {
            if (!cardId) {
                setLoading(false);
                setError(null);
                setPriceHistory([]);
                setPriceStats(null);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const lastFetchedTimestamp = await getLorcanaCardApiTimestamp(cardId);
                const now = Date.now();

                if (lastFetchedTimestamp && (now - lastFetchedTimestamp < CACHE_DURATION_MS)) {
                    if (priceHistory.length > 0 || priceStats) {
                        setLoading(false);
                        return;
                    }
                }

                const [history, stats] = await Promise.all([
                    getLorcanaPriceHistory(cardId),
                    getLorcanaPriceHistoryStats(cardId)
                ]);

                setPriceHistory(history);
                setPriceStats(stats);
                await setLorcanaCardApiTimestamp(cardId, Date.now());

            } catch (err) {
                console.error('Error loading Lorcana price data:', err);
                setError('Failed to load price data. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        performLoad();
    }, [cardId]);

    const formatChartData = useCallback((data: LorcanaPriceHistoryEntry[]) => {
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
    }, []);

    const chartData = useMemo(() => formatChartData(priceHistory), [priceHistory, formatChartData]);
    const maxValue = useMemo(() => Math.max(
        0, // Ensure maxValue is at least 0, especially if data arrays are empty
        ...chartData.normalData.map(d => d.value),
        ...chartData.foilData.map(d => d.value)
    ), [chartData]);

    const formatPrice = useCallback((price: string | number | null): string => {
        if (price === null || price === undefined) return 'N/A';
        const numPrice = typeof price === 'string' ? parseFloat(price) : price;
        return numPrice ? `$${numPrice.toFixed(2)}` : 'N/A';
    }, []);

    const formatDate = useCallback((dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }, []);

    const formatPercentage = useCallback((value: number): string => {
        return value ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '0%';
    }, []);

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
        <View style={styles.container}>
            <View style={styles.chartContainer} onLayout={onChartContainerLayout}>
                <Text style={styles.chartTitle}>Price History</Text>
                {chartContainerWidth > 0 && <LineChart
                    areaChart
                    data={chartData.normalData}
                    data2={chartData.foilData}
                    height={200}
                    width={chartContainerWidth}
                    noOfSections={5}
                    maxValue={maxValue > 0 ? maxValue * 1.1 : 1}
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
                />}
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
            
            <PriceStatistics 
                latestNormalPrice={priceHistory.length > 0 ? priceHistory[0].usd : null}
                latestFoilPrice={priceHistory.length > 0 ? priceHistory[0].usd_foil : null}
                priceStats={priceStats} 
                formatPrice={formatPrice} 
                formatPercentage={formatPercentage} 
                styles={styles} 
            />
            
            <PriceHistoryTable priceHistory={priceHistory} formatDate={formatDate} formatPrice={formatPrice} styles={styles} />
        </View>
    );
});

const useStyles = () => useThemedStyles((theme) => ({
    container: {
        backgroundColor: theme.background,
    } as ViewStyle,
    loadingContainer: {
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