import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

interface LoadingScreenProps {
    message?: string;
    error?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...', error }) => {
    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.message}>
                {error ? `Error: ${error}` : message}
            </Text>
            {error && (
                <Text style={styles.errorHint}>
                    Please try again. If the problem persists, contact support.
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 20,
    },
    message: {
        marginTop: 20,
        fontSize: 16,
        color: '#333',
        textAlign: 'center',
    },
    errorHint: {
        marginTop: 10,
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
});

export default LoadingScreen; 