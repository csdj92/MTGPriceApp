import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
} from 'react-native';
import { databaseService, Card } from '../services/DatabaseService';
import CardList from '../components/CardList';

const StartScreen = () => {
    const [cards, setCards] = useState<Card[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showList, setShowList] = useState(false);

    const handleShowCards = async () => {
        try {
            setIsLoading(true);
            const fetchedCards = await databaseService.getFirst100Cards();
            setCards(fetchedCards);
            setShowList(true);
        } catch (error) {
            console.error('Error fetching cards:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (showList) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>MTG Cards</Text>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setShowList(false)}>
                        <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
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
                    style={styles.button}
                    onPress={handleShowCards}
                    activeOpacity={0.7}>
                    <Text style={styles.buttonText}>Show First 100 Cards</Text>
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
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 40,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#3498db',
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 25,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
    },
    backButton: {
        position: 'absolute',
        left: 16,
        padding: 8,
    },
    backButtonText: {
        color: '#3498db',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default StartScreen; 