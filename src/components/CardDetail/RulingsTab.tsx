import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ExtendedCard } from '../../types/card';
import { databaseService } from '../../services/DatabaseService';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AllPrintingsJsonDatabase from '../../services/database/AllPrintingsJsonDatabase';
const Icon = MaterialCommunityIcons as unknown as React.ComponentType<any>;

interface CardRuling {
    date: string;
    text: string;
}

interface RulingsTabProps {
    card: ExtendedCard;
}

// Helper function to safely sanitize text for rendering
const sanitizeText = (text: any): string => {
    if (text === null || text === undefined) {
        return '';
    }
    
    // Convert to string and handle special characters
    try {
        const stringText = String(text);
        // Replace any problematic characters or patterns
        return stringText
            .replace(/\\n/g, '\n')
            .replace(/\{([^}]+)\}/g, '$1') // Remove curly braces that might contain mana symbols
            .replace(/[^\x20-\x7E\n]/g, ''); // Remove non-printable characters
    } catch (e) {
        console.error('Error sanitizing text:', e);
        return '';
    }
};

// Function to fetch card rulings from database or API
const fetchCardRulings = async (card: ExtendedCard): Promise<CardRuling[]> => {
    try {
        // First check if we have rulings in the database
        if (card.uuid) {
            const dbRulings = await AllPrintingsJsonDatabase.getInstance().getCardRulings(card.uuid);
            if (dbRulings.length > 0) {
                // Use console.debug instead of console.log to avoid issues
                if (__DEV__) {
                    console.debug(`Found ${dbRulings.length} rulings in database for ${card.name}`);
                }
                return dbRulings;
            }
        }
        
        // If no rulings in database or no uuid, try to fetch from Scryfall
        if (!card.rulings_uri) {
            return [];
        }
        
        // Use console.debug instead of console.log to avoid issues
        if (__DEV__) {
            console.debug(`Fetching rulings from Scryfall for ${card.name}`);
        }
        const response = await fetch(card.rulings_uri);
        if (!response.ok) {
            throw new Error(`Failed to fetch rulings: ${response.status}`);
        }
        
        const data = await response.json();
        const rulings = data.data || [];
        
        // Save rulings to database if we have a card UUID and rulings were found
        if (card.uuid && rulings.length > 0) {
            // Use console.debug instead of console.log to avoid issues
            if (__DEV__) {
                console.debug(`Saving ${rulings.length} rulings to database for ${card.name}`);
            }
            await AllPrintingsJsonDatabase.getInstance().saveCardRulings(card.uuid, rulings);
        }
        
        return rulings;
    } catch (error) {
        console.error('Error fetching card rulings:', error);
        return [];
    }
};

// Helper function to format date to more readable format
const formatRulingDate = (dateString: string): string => {
    if (!dateString) return 'Unknown Date';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (error) {
        return dateString;
    }
};

const RulingsTab: React.FC<RulingsTabProps> = ({ card }) => {
    const [rulings, setRulings] = useState<CardRuling[]>([]);
    const [loading, setLoading] = useState(true);
    const { theme } = useTheme();

    useEffect(() => {
        const loadRulings = async () => {
            setLoading(true);
            try {
                const fetchedRulings = await fetchCardRulings(card);
                setRulings(fetchedRulings);
            } catch (error) {
                console.error('Error loading rulings:', error);
            } finally {
                setLoading(false);
            }
        };

        loadRulings();
    }, [card]);

    if (loading) {
        return (
            <View style={[styles.tabContent, styles.centerContent]}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                    Loading rulings...
                </Text>
            </View>
        );
    }

    if (rulings.length === 0) {
        return (
            <View style={[styles.tabContent, styles.centerContent]}>
                <Icon name="book-open-variant" size={48} color={theme.textSecondary} style={styles.emptyIcon} />
                <Text style={[styles.noContentText, { color: theme.textSecondary }]}>
                    No rulings available for this card.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView style={[styles.tabContent, { backgroundColor: theme.background }]}>
            <View style={styles.headerContainer}>
                <View style={styles.headerContent}>
                    <Icon name="gavel" size={18} color={theme.primary} />
                    <Text style={[styles.headerText, { color: theme.text }]}>
                        Official Rulings ({rulings.length})
                    </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>
            
            {rulings.map((ruling, index) => (
                <View 
                    key={index} 
                    style={[
                        styles.rulingItem, 
                        { 
                            backgroundColor: theme.surface, 
                            borderLeftColor: theme.primary,
                            borderBottomColor: theme.border,
                            borderBottomWidth: index === rulings.length - 1 ? 0 : 1 
                        }
                    ]}
                >
                    <View style={styles.rulingHeader}>
                        <View style={[styles.dateBadge, { backgroundColor: theme.primary + '20' }]}>
                            <Text style={[styles.rulingDate, { color: theme.primary }]}>
                                {formatRulingDate(ruling.date)}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.rulingTextContainer}>
                        {ruling.text ? 
                            sanitizeText(ruling.text).split('\n').map((paragraph, index) => {
                                // Additional safety check
                                if (!paragraph) return null;
                                
                                return (
                                    <Text 
                                        key={index}
                                        style={[styles.rulingText, { color: theme.text }]}
                                    >
                                        {sanitizeText(paragraph)}
                                    </Text>
                                );
                            })
                            :
                            <Text style={[styles.rulingText, { color: theme.text }]}>
                                No ruling text available
                            </Text>
                        }
                    </View>
                </View>
            ))}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    tabContent: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    emptyIcon: {
        marginBottom: 12,
        opacity: 0.6,
    },
    noContentText: {
        fontSize: 16,
        textAlign: 'center',
    },
    headerContainer: {
        padding: 16,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    divider: {
        height: 1,
        marginTop: 12,
    },
    rulingItem: {
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    rulingHeader: {
        marginBottom: 12,
    },
    dateBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    rulingDate: {
        fontSize: 12,
        fontWeight: '600',
    },
    rulingTextContainer: {
        width: '100%',
    },
    rulingText: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 8,
    },
});

export default RulingsTab; 