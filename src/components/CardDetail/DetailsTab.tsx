import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ExtendedCard } from '../../types/card';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<any>;

interface DetailsTabProps {
    card: ExtendedCard;
    normalPrice: string;
    foilPrice: string;
}

// Function to format price nicely
const getFormattedPrice = (price: number): string => 
    new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);

// Helper function to render card text with mana symbols highlighted and proper formatting
const renderCardText = (text: string, textColor: string, highlightColor: string) => {
    // Process text to handle escape sequences
    const processedText = text.replace(/\\n/g, '\n'); // Replace literal "\n" with actual newlines
    
    // Handle reminder text in parentheses (should be italic)
    const parts = [];
    let currentText = '';
    let inParentheses = false;
    let inManaSymbol = false;
    let manaSymbol = '';
    
    // Process character by character to handle special formatting
    for (let i = 0; i < processedText.length; i++) {
        const char = processedText[i];
        
        // Handle mana symbols
        if (char === '{') {
            if (currentText) {
                parts.push({ type: inParentheses ? 'reminder' : 'regular', text: currentText });
                currentText = '';
            }
            inManaSymbol = true;
            manaSymbol = '{';
        } else if (inManaSymbol && char === '}') {
            manaSymbol += '}';
            parts.push({ type: 'mana', text: manaSymbol });
            inManaSymbol = false;
            manaSymbol = '';
        } else if (inManaSymbol) {
            manaSymbol += char;
        }
        // Handle parentheses for reminder text
        else if (char === '(' && !inParentheses) {
            if (currentText) {
                parts.push({ type: 'regular', text: currentText });
                currentText = '';
            }
            inParentheses = true;
            currentText = '(';
        } else if (char === ')' && inParentheses) {
            currentText += ')';
            parts.push({ type: 'reminder', text: currentText });
            currentText = '';
            inParentheses = false;
        } else {
            currentText += char;
        }
    }
    
    // Add any remaining text
    if (currentText) {
        parts.push({ type: inParentheses ? 'reminder' : 'regular', text: currentText });
    }
    
    // Render each part with appropriate styling
    return parts.map((part, index) => {
        if (part.type === 'mana') {
            return (
                <Text 
                    key={index} 
                    style={[
                        styles.manaSymbol, 
                        { 
                            color: highlightColor,
                            backgroundColor: `${highlightColor}20`, // 20% opacity of the highlight color
                        }
                    ]}
                >
                    {part.text}
                </Text>
            );
        } else if (part.type === 'reminder') {
            return (
                <Text 
                    key={index} 
                    style={{ 
                        color: textColor,
                        fontStyle: 'italic',
                        opacity: 0.8
                    }}
                >
                    {part.text}
                </Text>
            );
        } else {
            return (
                <Text key={index} style={{ color: textColor }}>
                    {part.text}
                </Text>
            );
        }
    });
};

const DetailsTab: React.FC<DetailsTabProps> = ({ card, normalPrice, foilPrice }) => {
    const { theme, isDark } = useTheme();
    
    return (
        <ScrollView style={[styles.tabContent, { backgroundColor: theme.background }]}>
            {/* Card Prices Section */}
            <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                    <Icon name="cash-multiple" size={20} color={theme.primary} />
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Price Information</Text>
                </View>
                <View style={styles.priceContainer}>
                    {card.hasNonFoil && (
                        <View style={[styles.priceCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)' }]}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Normal</Text>
                            <Text style={[styles.priceValue, { color: theme.primary }]}>
                                {getFormattedPrice(parseFloat(normalPrice) || 0)}
                            </Text>
                        </View>
                    )}
                    {card.hasFoil && (
                        <View style={[styles.priceCard, { 
                            backgroundColor: isDark ? 'rgba(255, 215, 0, 0.04)' : 'rgba(255, 215, 0, 0.08)',
                            borderColor: 'rgba(255, 215, 0, 0.2)'
                        }]}>
                            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Foil</Text>
                            <Text style={[styles.priceValue, { color: '#E6C200' }]}>
                                {getFormattedPrice(parseFloat(foilPrice) || 0)}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Card Details Section */}
            <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                    <Icon name="card-text-outline" size={20} color={theme.primary} />
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Card Details</Text>
                </View>
                <View style={styles.detailsGrid}>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Set</Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                            {card.setName || 'Unknown Set'}
                        </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Number</Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                            {card.collectorNumber || 'N/A'}
                        </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Rarity</Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                            {card.rarity || 'Unknown'}
                        </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Type</Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                            {card.type || 'Unknown'}
                        </Text>
                    </View>
                    
                    {card.manaCost && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Mana Cost</Text>
                            <Text style={[styles.detailValue, { color: theme.text }]}>
                                {card.manaCost}
                            </Text>
                        </View>
                    )}
                    
                    {/* Power/Toughness for creatures */}
                    {(card.power !== undefined && card.toughness !== undefined) && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Power/Toughness</Text>
                            <View style={styles.statContainer}>
                                <View style={[styles.statBadge, { backgroundColor: theme.primary + '15' }]}>
                                    <Text style={[styles.statValue, { color: theme.primary }]}>
                                        {card.power}/{card.toughness}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Loyalty for planeswalkers - only display if card type includes 'Planeswalker' */}
                    {card.type && card.type.includes('Planeswalker') && (
                        <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Loyalty</Text>
                            <View style={styles.statContainer}>
                                <View style={[styles.loyaltyBadge, { backgroundColor: theme.error + '15' }]}>
                                    <Text style={[styles.statValue, { color: theme.error }]}>
                                        {(card as any).loyalty || 'N/A'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </View>

            {/* Card Text Section */}
            {card.text && (
                <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.sectionHeader}>
                        <Icon name="format-text" size={20} color={theme.primary} />
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Card Text</Text>
                    </View>
                    <View style={styles.cardTextContainer}>
                        {card.text ? 
                            card.text.split('\n').map((paragraph, index) => (
                                <Text 
                                    key={index} 
                                    style={[styles.cardText, { color: theme.text }]}
                                >
                                    {renderCardText(paragraph, theme.text, theme.primary)}
                                </Text>
                            ))
                            :
                            <Text style={[styles.cardText, { color: theme.textSecondary, fontStyle: 'italic' }]}>
                                No card text available
                            </Text>
                        }
                    </View>
                </View>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    tabContent: {
        flex: 1,
        padding: 12,
    },
    section: {
        marginBottom: 16,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(128, 128, 128, 0.2)',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    priceContainer: {
        flexDirection: 'row',
        padding: 16,
        justifyContent: 'space-around',
    },
    priceCard: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        marginHorizontal: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    priceLabel: {
        fontSize: 14,
        marginBottom: 6,
    },
    priceValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    detailsGrid: {
        padding: 16,
    },
    detailRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(128, 128, 128, 0.1)',
    },
    detailLabel: {
        flex: 1,
        fontSize: 14,
    },
    detailValue: {
        flex: 2,
        fontSize: 14,
        fontWeight: '500',
    },
    statContainer: {
        flex: 2,
        flexDirection: 'row',
    },
    statBadge: {
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    loyaltyBadge: {
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    cardTextContainer: {
        padding: 16,
    },
    cardText: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 8,
    },
    manaSymbol: {
        fontWeight: '600',
        borderRadius: 4,
        paddingHorizontal: 2,
        overflow: 'hidden',
    },
});

export default DetailsTab; 