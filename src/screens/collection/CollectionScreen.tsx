import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Text,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Modal,
    TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { databaseService } from '../../services/DatabaseService';
import type { Collection } from '../../services/DatabaseService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type CollectionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Collection'>;
};

const CollectionScreen: React.FC<CollectionScreenProps> = ({ navigation }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionDescription, setNewCollectionDescription] = useState('');

    useEffect(() => {
        loadCollections();
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadCollections();
        });

        return unsubscribe;
    }, [navigation]);

    const loadCollections = async () => {
        setIsLoading(true);
        try {
            const loadedCollections = await databaseService.getCollections();
            setCollections(loadedCollections);
        } catch (error) {
            console.error('Error loading collections:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) {
            return;
        }

        try {
            const newCollection = await databaseService.createCollection(
                newCollectionName.trim(),
                newCollectionDescription.trim() || undefined
            );
            setCollections(prev => [...prev, newCollection]);
            setIsCreateModalVisible(false);
            setNewCollectionName('');
            setNewCollectionDescription('');
        } catch (error) {
            console.error('Error creating collection:', error);
        }
    };

    const renderCollectionItem = ({ item }: { item: Collection }) => (
        <TouchableOpacity
            style={styles.collectionItem}
            onPress={() => navigation.navigate('CollectionDetails', { collectionId: item.id })}
        >
            <View style={styles.collectionIcon}>
                <Icon name="cards" size={24} color="#666" />
            </View>
            <View style={styles.collectionInfo}>
                <Text style={styles.collectionName}>{item.name}</Text>
                <View style={styles.collectionStats}>
                    <Text style={styles.statsText}>
                        {item.cardCount} {item.cardCount === 1 ? 'card' : 'cards'}
                    </Text>
                    <Text style={styles.statsText}>·</Text>
                    <Text style={styles.statsText}>
                        ${item.totalValue.toFixed(2)}
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
                <Text style={styles.loadingText}>Loading collections...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Collections</Text>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setIsCreateModalVisible(true)}
                >
                    <Icon name="plus" size={24} color="#2196F3" />
                </TouchableOpacity>
            </View>

            {collections.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon name="folder-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No Collections</Text>
                    <Text style={styles.emptySubtext}>
                        Create a collection to start organizing your cards
                    </Text>
                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={() => setIsCreateModalVisible(true)}
                    >
                        <Text style={styles.createButtonText}>Create Collection</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={collections}
                    renderItem={renderCollectionItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContainer}
                />
            )}

            <Modal
                visible={isCreateModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsCreateModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Create Collection</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Collection Name"
                            value={newCollectionName}
                            onChangeText={setNewCollectionName}
                        />
                        <TextInput
                            style={[styles.input, styles.descriptionInput]}
                            placeholder="Description (optional)"
                            value={newCollectionDescription}
                            onChangeText={setNewCollectionDescription}
                            multiline
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setIsCreateModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.createModalButton]}
                                onPress={handleCreateCollection}
                            >
                                <Text style={styles.createButtonText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    addButton: {
        padding: 8,
    },
    listContainer: {
        padding: 16,
    },
    collectionItem: {
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
    collectionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    collectionInfo: {
        flex: 1,
    },
    collectionName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    collectionStats: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statsText: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
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
        marginBottom: 24,
    },
    createButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    createButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
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
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 16,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 16,
    },
    input: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 12,
    },
    descriptionInput: {
        height: 100,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 16,
    },
    modalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        marginLeft: 12,
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    createModalButton: {
        backgroundColor: '#2196F3',
    },
});

export default CollectionScreen; 