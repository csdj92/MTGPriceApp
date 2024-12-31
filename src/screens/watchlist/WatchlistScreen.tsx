import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { ExtendedCard } from '../../types/card';
import { downloadAndImportPriceData } from '../../utils/priceData';
import { databaseService } from '../../services/DatabaseService';

interface PriceData {
    uuid: string;
    normal_price: number;
    foil_price: number;
    last_updated: number;
}

const WatchlistScreen = () => {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = useState(false);
    const [priceData, setPriceData] = useState<PriceData[]>([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 50;

    useEffect(() => {
        loadPriceData();
    }, [currentPage]);

    const loadPriceData = async () => {
        setIsLoading(true);
        try {
            const prices = await databaseService.getCombinedPriceData(currentPage, PAGE_SIZE);
            console.log('Loaded combined prices:', prices);
            if (prices.length < PAGE_SIZE) {
                setHasMore(false);
            }
            setPriceData(prev => currentPage === 1 ? prices : [...prev, ...prices]);
        } catch (error) {
            console.error('Error loading price data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddCards = async () => {
        setIsLoading(true);
        try {
            if (!databaseService.isMTGJsonDatabaseInitialized()) {
                await databaseService.downloadMTGJsonDatabase();
            }

            await downloadAndImportPriceData((progress) => {
                setDownloadProgress(progress);
            });
            setCurrentPage(1);
            await loadPriceData();
        } catch (error) {
            console.error('Error updating data:', error);
        } finally {
            setIsLoading(false);
            setDownloadProgress(0);
        }
    };

    const renderPrice = ({ item }: { item: PriceData & { name?: string; setCode?: string } }) => (
        <View style={styles.cardItem}>
            <Text style={styles.cardName}>
                {item.name || 'Unknown Card'} ({item.setCode || 'Unknown Set'})
            </Text>
            <Text>Normal Price: ${item.normal_price.toFixed(2)}</Text>
            <Text>Foil Price: ${item.foil_price.toFixed(2)}</Text>
            <Text>Last Updated: {new Date(item.last_updated).toLocaleString()}</Text>
        </View>
    );

    if (isLoading && currentPage === 1) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>
                    {downloadProgress > 0
                        ? `Updating price data... ${Math.round(downloadProgress)}%`
                        : 'Loading price data...'}
                </Text>
            </View>
        );
    }

    if (priceData.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Icon name="star-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No price data available</Text>
                <Text style={styles.emptySubtext}>
                    Click the button below to download the latest price data
                </Text>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={handleAddCards}
                >
                    <Text style={styles.addButtonText}>Download Prices</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={priceData}
                renderItem={renderPrice}
                keyExtractor={(item) => item.uuid}
                onEndReached={() => {
                    if (!isLoading && hasMore) {
                        setCurrentPage(prev => prev + 1);
                    }
                }}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={() => (
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            Price Data ({priceData.length} items)
                        </Text>
                    </View>
                )}
                ListFooterComponent={() => (
                    isLoading ? (
                        <ActivityIndicator size="small" color="#2196F3" style={styles.footer} />
                    ) : null
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        marginTop: 16,
        fontWeight: '400',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
        marginTop: 8,
        marginBottom: 24,
        textAlign: 'center',
        maxWidth: '80%',
    },
    addButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 4,
        elevation: 0,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    header: {
        backgroundColor: '#fff',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    cardItem: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    cardName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    footer: {
        padding: 16,
    },
});

export default WatchlistScreen; 