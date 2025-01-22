import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import FastImage from 'react-native-fast-image';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'LorcanaCardDetails'>;

const LorcanaCardDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
    const { card } = route.params;

    React.useEffect(() => {
        navigation.setOptions({ title: card.Name || 'Card Details' });
    }, [card.Name, navigation]);

    return (
        <ScrollView style={styles.container}>
            <View style={styles.imageContainer}>
                {card.Image && (
                    <FastImage
                        source={{ uri: card.Image }}
                        style={styles.cardImage}
                        resizeMode={FastImage.resizeMode.contain}
                    />
                )}
            </View>
            <View style={styles.detailsContainer}>
                <Text style={styles.cardName}>{card.Name}</Text>
                <Text style={styles.cardText}>Set: {card.Set_Name}</Text>
                <Text style={styles.cardText}>Number: {card.Card_Num}</Text>
                <Text style={styles.cardText}>Rarity: {card.Rarity}</Text>
                <Text style={styles.cardText}>Color: {card.Color}</Text>
                <Text style={styles.priceText}>
                    Price: ${card.prices?.usd ? Number(card.prices.usd).toFixed(2) : '0.00'}
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    imageContainer: {
        aspectRatio: 0.72,
        width: '100%',
        backgroundColor: '#f5f5f5',
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    detailsContainer: {
        padding: 16,
    },
    cardName: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    cardText: {
        fontSize: 16,
        marginBottom: 4,
    },
    priceText: {
        fontSize: 18,
        fontWeight: '500',
        marginTop: 8,
        color: '#2196F3',
    },
});

export default LorcanaCardDetailsScreen; 