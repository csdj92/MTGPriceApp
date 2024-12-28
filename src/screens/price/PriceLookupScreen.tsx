import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Alert,
    Modal,
    SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { scryfallService } from '../../services/ScryfallService';
import CardList from '../../components/CardList';
import CardScanner from '../../components/CardScanner';
import type { ExtendedCard } from '../../services/ScryfallService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

type PriceLookupScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'PriceLookup'>;
};

const PriceLookupScreen: React.FC<PriceLookupScreenProps> = ({ navigation }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<ExtendedCard[]>([]);
    const [isCameraActive, setIsCameraActive] = useState(false);

    const handleManualSearch = async () => {
        if (!searchQuery.trim()) {
            Alert.alert('Error', 'Please enter a card name');
            return;
        }

        setIsLoading(true);
        try {
            const results = await scryfallService.searchCards(searchQuery);
            setSearchResults(results);
            if (results.length === 0) {
                Alert.alert('No Results', 'No cards found matching your search.');
            }
        } catch (error) {
            console.error('Error searching cards:', error);
            Alert.alert('Error', 'Failed to search cards. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleScanPress = () => {
        setIsCameraActive(true);
    };

    const handleScan = async (text: string) => {
        console.log('[PriceLookupScreen] Scan detected text:', text);
        setIsLoading(true);
        try {
            console.log('[PriceLookupScreen] Attempting to search for card with text:', text);
            const results = await scryfallService.searchCards(text);
            console.log(`[PriceLookupScreen] Search returned ${results.length} results`);
            setSearchResults(results);
            if (results.length === 0) {
                console.log('[PriceLookupScreen] No results found for scanned text');
                Alert.alert('No Results', 'No cards found matching the scanned text.');
            }
        } catch (error) {
            console.error('[PriceLookupScreen] Error processing scan:', error);
            Alert.alert('Error', 'Failed to process scan. Please try again.');
            setSearchResults([]);
        } finally {
            setIsLoading(false);
            setIsCameraActive(false);
        }
    };

    const handleScanError = (error: Error) => {
        Alert.alert('Scan Error', error.message);
        setIsCameraActive(false);
    };

    const toggleCamera = () => {
        console.log('[PriceLookupScreen] Toggling camera, current state:', !isCameraActive);
        setIsCameraActive(!isCameraActive);
    };

    const handleCardPress = (card: ExtendedCard) => {
        navigation.navigate('CardDetails', { card });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter card name..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleManualSearch}
                        returnKeyType="search"
                    />
                    <TouchableOpacity
                        style={styles.searchButton}
                        onPress={handleManualSearch}
                    >
                        <Icon name="magnify" size={24} color="white" />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleScanPress}
                >
                    <Icon name="camera" size={24} color="white" />
                    <Text style={styles.scanButtonText}>Scan Card</Text>
                </TouchableOpacity>
            </View>

            <CardList
                cards={searchResults}
                isLoading={isLoading}
                onCardPress={handleCardPress}
            />

            <Modal
                visible={isCameraActive}
                animationType="slide"
                onRequestClose={() => setIsCameraActive(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setIsCameraActive(false)}
                        >
                            <Icon name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Scan Card</Text>
                    </View>
                    <CardScanner
                        onTextDetected={handleScan}
                        onError={handleScanError}
                    />
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    searchContainer: {
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    inputContainer: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    input: {
        flex: 1,
        height: 48,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 16,
        marginRight: 8,
    },
    searchButton: {
        width: 48,
        height: 48,
        backgroundColor: '#2196F3',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanButton: {
        flexDirection: 'row',
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 8,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
    },
    closeButton: {
        padding: 8,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '500',
        marginLeft: 16,
    },
});

export default PriceLookupScreen; 