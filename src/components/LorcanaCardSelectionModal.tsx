import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Dimensions,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
// Fix the Icon type with a proper type assertion to avoid type errors
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;
import type { LorcanaCard } from '../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../utils/imageUtils';

// Separate component for the card item - this can use hooks properly
const CardItem = React.memo(({ 
    item, 
    onSelect, 
    onClose 
}: { 
    item: LorcanaCard; 
    onSelect?: (card: LorcanaCard) => void; 
    onClose?: () => void;
}) => {
    const [imageError, setImageError] = useState(false);
    
    const handlePress = () => {
        if (onSelect) {
            onSelect(item);
        } else {
            console.warn('onSelect is undefined');
            // Fallback to onClose if onSelect is missing
            if (onClose) onClose();
        }
    };
    
    return (
        <TouchableOpacity
            style={styles.cardItem}
            onPress={handlePress}
        >
            {item.Image && !imageError ? (
                <FastImage
                    source={getImageSource(item.Image) || { 
                        uri: item.Image,
                        priority: FastImage.priority.high,
                        cache: FastImage.cacheControl.immutable
                    }}
                    style={styles.cardImage}
                    resizeMode={FastImage.resizeMode.contain}
                    onError={() => {
                        console.log(`[LorcanaCardSelection] Image load error for ${item.Name}: ${item.Image}`);
                        handleImageLoadError(item.Image, item.Name);
                        setImageError(true);
                    }}
                    onLoad={() => {
                        console.log(`[LorcanaCardSelection] Image loaded successfully: ${item.Name}`);
                        handleImageLoadSuccess(item.Image, { name: item.Name, id: item.Unique_ID });
                        setImageError(false);
                    }}
                />
            ) : (
                <View style={[styles.cardImage, styles.placeholderImage]}>
                    <Icon name={imageError ? "image-broken" : "image-off"} size={24} color="#666" />
                </View>
            )}
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
});

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
                        renderItem={({ item }) => (
                            <CardItem 
                                item={item}
                                onSelect={onSelect}
                                onClose={onClose}
                            />
                        )}
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
    placeholderImage: {
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
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