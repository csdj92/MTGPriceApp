import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Dimensions,
} from 'react-native';
import type { LorcanaCard } from '../types/lorcana';

interface LorcanaCardSelectionModalProps {
    visible: boolean;
    cards: LorcanaCard[];
    onSelect: (card: LorcanaCard) => void;
    onClose: () => void;
}

const LorcanaCardSelectionModal: React.FC<LorcanaCardSelectionModalProps> = ({
    visible,
    cards,
    onSelect,
    onClose,
}) => {
    const renderCard = ({ item }: { item: LorcanaCard }) => (
        <TouchableOpacity
            style={styles.cardItem}
            onPress={() => onSelect(item)}
        >
            <Image
                source={{ uri: item.Image }}
                style={styles.cardImage}
                resizeMode="contain"
            />
            <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.Name}</Text>
                <Text style={styles.cardDetails}>
                    {item.Set_Name} • {item.Rarity}
                </Text>
                {item.Classifications && (
                    <Text style={styles.cardDetails}>
                        {item.Classifications}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.title}>Multiple Cards Found</Text>
                    <Text style={styles.subtitle}>Please select the correct card:</Text>
                    
                    <FlatList
                        data={cards}
                        renderItem={renderCard}
                        keyExtractor={item => item.Unique_ID}
                        contentContainerStyle={styles.listContainer}
                    />
                    
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                    >
                        <Text style={styles.closeButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: width * 0.9,
        maxHeight: '80%',
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 16,
        color: '#666',
    },
    listContainer: {
        paddingVertical: 8,
    },
    cardItem: {
        flexDirection: 'row',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
    },
    cardImage: {
        width: 60,
        height: 84,
        borderRadius: 4,
        marginRight: 12,
    },
    cardInfo: {
        flex: 1,
    },
    cardName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    cardDetails: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    closeButton: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: 16,
        color: '#333',
    },
});

export default LorcanaCardSelectionModal; 