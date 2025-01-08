import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { databaseService } from '../../services/DatabaseService';
import type { Collection } from '../../services/DatabaseService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type SetCompletionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'SetCompletion'>;
};

interface SetCollection extends Collection {
    totalCards: number;
    collectedCards: number;
    completionPercentage: number;
}

const SetCompletionScreen: React.FC<SetCompletionScreenProps> = ({ navigation }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [setCollections, setSetCollections] = useState<SetCollection[]>([]);

    useEffect(() => {
        loadSetCollections();
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadSetCollections();
        });

        return unsubscribe;
    }, [navigation]);

    const loadSetCollections = async () => {
        setIsLoading(true);
        try {
            const collections = await databaseService.getSetCollections();
            setSetCollections(collections);
        } catch (error) {
            console.error('Error loading set collections:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const renderSetItem = ({ item }: { item: SetCollection }) => (
        <TouchableOpacity
            style={styles.setItem}
            onPress={() => navigation.navigate('CollectionDetails', { collectionId: item.id })}
        >
            <View style={styles.setIcon}>
                <Icon name="cards" size={24} color="#666" />
            </View>
            <View style={styles.setInfo}>
                <Text style={styles.setName}>{item.name}</Text>
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View 
                            style={[
                                styles.progressFill, 
                                { width: `${item.completionPercentage}%` }
                            ]} 
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {item.collectedCards}/{item.totalCards} ({item.completionPercentage.toFixed(1)}%)
                    </Text>
                </View>
                <View style={styles.setStats}>
                    <Text style={styles.statsText}>
                        ${(item.totalValue || 0).toFixed(2)}
                    </Text>
                </View>
            </View>
            <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
    );

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingText}>Loading sets...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Set Completion</Text>
            </View>

            {setCollections.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon name="cards-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No Sets Found</Text>
                    <Text style={styles.emptySubtext}>
                        Scan cards to start tracking set completion
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={setCollections}
                    renderItem={renderSetItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
    },
    listContainer: {
        padding: 16,
    },
    setItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    setIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    setInfo: {
        flex: 1,
    },
    setName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    progressContainer: {
        marginTop: 4,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        marginBottom: 4,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2196F3',
        borderRadius: 2,
    },
    progressText: {
        fontSize: 12,
        color: '#666',
    },
    setStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statsText: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
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
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginTop: 8,
    },
});

export default SetCompletionScreen; 