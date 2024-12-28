import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { scryfallService } from '../services/ScryfallService';
import type { ExtendedCard } from '../types/card';
import CardList from '../components/CardList';

const StartScreen = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [cards, setCards] = useState<ExtendedCard[]>([]);
    const [showList, setShowList] = useState(false);

    const fetchCards = async () => {
        setIsLoading(true);
        try {
            console.log('Starting to fetch cards...');
            const { data: fetchedCards } = await scryfallService.searchCards('set:fdn');
            setCards(fetchedCards);
            setShowList(true);
        } catch (error) {
            console.error('Error fetching cards:', error);
            setCards([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        setShowList(false);
        setCards([]);
    };

    if (showList) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>MTG Cards ({cards.length})</Text>
                </View>
                <CardList cards={cards} isLoading={isLoading} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>MTG Price Tracker</Text>
                <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={fetchCards}
                    disabled={isLoading}
                >
                    <Text style={styles.buttonText}>
                        Show First 100 Cards
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        backgroundColor: 'white',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
        flex: 1,
        textAlign: 'center',
        marginRight: 40, // To offset the back button and center the title
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
        color: '#333',
    },
    button: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        minWidth: 200,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#ccc',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    backButton: {
        padding: 8,
    },
    backButtonText: {
        color: '#2196F3',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default StartScreen; 