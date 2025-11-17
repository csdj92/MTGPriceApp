import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import { useTheme } from '../../context/ThemeContext';

// Fix Icon type with proper type assertion
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface LorcanaVersionModalProps {
    card: LorcanaCardWithPrice | null;
    visible: boolean;
    availableVersions: LorcanaCardWithPrice[];
    onClose: () => void;
    onVersionChange: (version: LorcanaCardWithPrice) => void;
    onAddToCollection?: () => void;
    onRemoveFromCollection?: () => void;
}

const LorcanaVersionModal: React.FC<LorcanaVersionModalProps> = ({
    card,
    visible,
    availableVersions,
    onClose,
    onVersionChange,
    onAddToCollection,
    onRemoveFromCollection
}) => {
    const { theme } = useTheme();

    if (!card) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Select Card Version</Text>
                    <ScrollView>
                        {availableVersions.map(version => (
                            <TouchableOpacity
                                key={version.Unique_ID}
                                style={[styles.versionOption, { borderColor: theme.border || theme.surface }]}
                                onPress={() => onVersionChange(version)}
                            >
                                <Text style={[styles.versionText, { color: theme.text }]}>{version.Name}</Text>
                                {version.Image ? (
                                    <FastImage
                                    source={getImageSource(version.Image) || { 
                                        uri: version.Image,
                                        priority: FastImage.priority.high,
                                        cache: FastImage.cacheControl.immutable
                                    }}
                                    style={styles.versionImage}
                                    resizeMode={FastImage.resizeMode.contain}
                                    onError={() => {
                                        console.log(`[LorcanaVersionModal] Version image load error for ${version.Name}: ${version.Image}`);
                                        handleImageLoadError(version.Image, version.Name);
                                    }}
                                    onLoad={() => {
                                        console.log(`[LorcanaVersionModal] Version image loaded successfully: ${version.Name}`);
                                        handleImageLoadSuccess(version.Image, { 
                                            name: version.Name, 
                                            id: version.Unique_ID, 
                                            context: 'version_modal'
                                        });
                                    }}
                                />
                                ) : (
                                    <View style={[styles.versionImage, { backgroundColor: theme.card || theme.surface, justifyContent: 'center', alignItems: 'center' }]}>
                                        <Icon name="image-off" size={24} color={theme.textSecondary} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {/* Only show the Add to Collection button if the card is not collected */}
                    {card && !card.collected && onAddToCollection && (
                        <TouchableOpacity
                            style={[styles.addButton, { backgroundColor: theme.success || '#28a745' }]}
                            onPress={onAddToCollection}
                        >
                            <Text style={[styles.addButtonText, { color: '#ffffff' }]}>Add to Collection</Text>
                        </TouchableOpacity>
                    )}
                    {/* Show a Remove from Collection button if the card is already collected */}
                    {card && card.collected && onRemoveFromCollection && (
                        <TouchableOpacity
                            style={[styles.removeButton, { backgroundColor: theme.error || '#dc3545' }]}
                            onPress={onRemoveFromCollection}
                        >
                            <Text style={[styles.removeButtonText, { color: '#ffffff' }]}>Remove from Collection</Text>
                        </TouchableOpacity>
                    )}
                   
                    <TouchableOpacity
                        style={styles.modalCloseButton}
                        onPress={onClose}
                    >
                        <Icon name="close" size={24} color="#000" />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxHeight: '90%',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
        position: 'relative',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
    versionOption: {
        padding: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        margin: 5,
        alignItems: 'center',
    },
    versionText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    versionImage: {
        width: 100,
        height: 140,
        borderRadius: 5,
    },
    addButton: {
        backgroundColor: '#28a745',
        padding: 10,
        borderRadius: 5,
        margin: 10,
        alignItems: 'center',
    },
    addButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    removeButton: {
        backgroundColor: '#dc3545',
        padding: 10,
        borderRadius: 5,
        margin: 10,
        alignItems: 'center',
    },
    removeButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

export default LorcanaVersionModal; 