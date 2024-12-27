import React from 'react';
import { View, Button, StyleSheet } from 'react-native';

const StartScreen = ({ navigation }) => {
    const fetchCards = () => {
        // Logic to fetch the first 100 cards
        // This can be a placeholder for now
        console.log('Fetching first 100 cards...');
    };

    return (
        <View style={styles.container}>
            <Button title="Show First 100 Cards" onPress={fetchCards} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    button: {
        padding: 10,
        backgroundColor: '#6200ee',
        borderRadius: 5,
    },
});

export default StartScreen; 