import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ExtendedCard } from '../../services/ScryfallService';
import CardList from '../../components/CardList';

const WatchlistScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [watchlist, setWatchlist] = useState<ExtendedCard[]>([]);
    const [sortBy, setSortBy] = useState<'name' | 'price' | 'change'>('name');

    useEffect(() => {
        loadWatchlist();
    }, []);

    const loadWatchlist = async () => {
        setIsLoading(true);
        try {
            // TODO: Implement watchlist loading from local database
            setWatchlist([]);
        } catch (error) {
            console.error('Error loading watchlist:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSort = () => {
        // TODO: Implement sort functionality
    };

    const renderHeader = () => (
        <View style={styles.header}>
            <View style={styles.headerControls}>
                <Text style={styles.headerTitle}>
                    Watching {watchlist.length} Cards
                </Text>
                <TouchableOpacity
                    style={styles.sortButton}
                    onPress={handleSort}
                >
                    <Icon name="sort" size={24} color="#2196F3" />
                    <Text style={styles.sortButtonText}>Sort by {sortBy}</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.stats}>
                <Text style={styles.statsText}>
                    Total Value: $0.00
                </Text>
                <Text style={styles.statsText}>
                    24h Change: +$0.00
                </Text>
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading watchlist...</Text>
            </View>
        );
    }

    if (watchlist.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Icon name="star-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>Your watchlist is empty</Text>
                <Text style={styles.emptySubtext}>
                    Add cards to track their prices and get notifications when they change
                </Text>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => {
                        // TODO: Navigate to search screen
                    }}
                >
                    <Text style={styles.addButtonText}>Add Cards</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderHeader()}
            <CardList
                cards={watchlist}
                isLoading={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
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
        padding: 20,
    },
    emptyText: {
        fontSize: 18,
        color: '#666',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
        marginTop: 8,
        marginBottom: 24,
        textAlign: 'center',
    },
    addButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        backgroundColor: '#fff',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    sortButtonText: {
        marginLeft: 8,
        fontSize: 16,
        color: '#2196F3',
    },
    stats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statsText: {
        fontSize: 14,
        color: '#666',
    },
});

export default WatchlistScreen; 