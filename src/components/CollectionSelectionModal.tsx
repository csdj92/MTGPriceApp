import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Collection } from '../types/collection';
import { databaseService } from '../services/DatabaseService';

interface CollectionSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (collectionId: string) => void;
}

const CollectionSelectionModal: React.FC<CollectionSelectionModalProps> = ({
    visible,
    onClose,
    onSelect,
}) => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCollections();
    }, [visible]);

    const loadCollections = async () => {
        try {
            setLoading(true);
            const result = await databaseService.getCollections();
            setCollections(result);
        } catch (error) {
            console.error('Error loading collections:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Collection }) => (
        <TouchableOpacity
            style={styles.collectionItem}
            onPress={() => onSelect(item.id)}
        >
            <View style={styles.collectionInfo}>
                <Text style={styles.collectionName}>{item.name}</Text>
                <Text style={styles.collectionStats}>
                    {item.cardCount} cards • ${item.totalValue?.toFixed(2)}
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
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add to Collection</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#2196F3" />
                            <Text style={styles.loadingText}>Loading collections...</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={collections}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id.toString()}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                            contentContainerStyle={styles.listContainer}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <Icon name="folder-outline" size={48} color="#ccc" />
                                    <Text style={styles.emptyText}>No collections found</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
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
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    listContainer: {
        padding: 16,
    },
    collectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    collectionInfo: {
        flex: 1,
        marginRight: 16,
    },
    collectionName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    collectionStats: {
        fontSize: 14,
        color: '#666',
    },
    separator: {
        height: 1,
        backgroundColor: '#eee',
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
        marginTop: 16,
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
});

export default CollectionSelectionModal; 