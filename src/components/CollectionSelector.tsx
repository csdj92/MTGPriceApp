import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { databaseService } from '../services/DatabaseService';
import type { Collection } from '../services/DatabaseService';

interface CollectionSelectorProps {
    visible: boolean;
    onClose: () => void;
    onSelectCollection: (collection: Collection) => void;
}

const CollectionSelector: React.FC<CollectionSelectorProps> = ({
    visible,
    onClose,
    onSelectCollection,
}) => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    useEffect(() => {
        if (visible) {
            loadCollections();
        }
    }, [visible]);

    const loadCollections = async () => {
        setIsLoading(true);
        try {
            const loadedCollections = await databaseService.getCollections();
            console.log('Loaded collections:', loadedCollections);
            setCollections(loadedCollections);
        } catch (error) {
            console.error('Error loading collections:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;

        setIsCreating(true);
        try {
            const newCollection = await databaseService.createCollection(newCollectionName.trim());
            setCollections(prev => [...prev, newCollection]);
            setNewCollectionName('');
            setShowCreateForm(false);
            onSelectCollection(newCollection);
        } catch (error) {
            console.error('Error creating collection:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const renderCollectionItem = ({ item }: { item: Collection }) => (
        <TouchableOpacity
            style={styles.collectionItem}
            onPress={() => onSelectCollection(item)}
        >
            <View style={styles.collectionIcon}>
                <Icon name="cards" size={24} color="#666" />
            </View>
            <View style={styles.collectionInfo}>
                <Text style={styles.collectionName}>{item.name}</Text>
                <Text style={styles.collectionStats}>
                    {item.cardCount} cards · ${item.totalValue.toFixed(2)}
                </Text>
            </View>
            <Icon name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Select Collection</Text>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#2196F3" />
                            <Text style={styles.loadingText}>Loading collections...</Text>
                        </View>
                    ) : (
                        <>
                            {!showCreateForm ? (
                                <>
                                    <FlatList
                                        data={collections}
                                        renderItem={renderCollectionItem}
                                        keyExtractor={item => item.id}
                                        contentContainerStyle={styles.listContainer}
                                        ListEmptyComponent={
                                            <View style={styles.emptyContainer}>
                                                <Text style={styles.emptyText}>No collections found</Text>
                                            </View>
                                        }
                                    />
                                    <TouchableOpacity
                                        style={styles.createButton}
                                        onPress={() => setShowCreateForm(true)}
                                    >
                                        <Icon name="plus" size={24} color="white" />
                                        <Text style={styles.createButtonText}>Create New Collection</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <View style={styles.createForm}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Collection Name"
                                        value={newCollectionName}
                                        onChangeText={setNewCollectionName}
                                        autoFocus
                                    />
                                    <View style={styles.createFormButtons}>
                                        <TouchableOpacity
                                            style={[styles.formButton, styles.cancelButton]}
                                            onPress={() => setShowCreateForm(false)}
                                        >
                                            <Text style={styles.cancelButtonText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.formButton, styles.submitButton]}
                                            onPress={handleCreateCollection}
                                            disabled={isCreating}
                                        >
                                            {isCreating ? (
                                                <ActivityIndicator size="small" color="white" />
                                            ) : (
                                                <Text style={styles.submitButtonText}>Create</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
    },
    closeButton: {
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
        fontSize: 14,
        color: '#666',
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2196F3',
        margin: 16,
        padding: 16,
        borderRadius: 12,
    },
    createButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    createForm: {
        padding: 16,
    },
    input: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
    },
    createFormButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    formButton: {
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
    submitButton: {
        backgroundColor: '#2196F3',
        minWidth: 80,
        alignItems: 'center',
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CollectionSelector; 