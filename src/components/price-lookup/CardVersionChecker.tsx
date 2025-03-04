import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { ExtendedCard } from '../../types/card';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface CardVersionCheckerProps {
    card: ExtendedCard | null;
    originalText: string;
    verificationScore: number;
    isVerifying: boolean;
    isVerified: boolean | null;
}

const Icon = MaterialCommunityIcons as any; // Temporary type assertion

const CardVersionChecker: React.FC<CardVersionCheckerProps> = ({
    card,
    originalText,
    verificationScore,
    isVerifying,
    isVerified
}) => {
    const [fadeAnimation] = useState(new Animated.Value(0));
    const [scaleAnimation] = useState(new Animated.Value(0.9));

    useEffect(() => {
        if (card || isVerifying) {
            // Animate in
            Animated.parallel([
                Animated.timing(fadeAnimation, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.ease)
                }),
                Animated.timing(scaleAnimation, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                    easing: Easing.elastic(1.2)
                })
            ]).start();
        } else {
            // Animate out
            Animated.parallel([
                Animated.timing(fadeAnimation, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true
                }),
                Animated.timing(scaleAnimation, {
                    toValue: 0.9,
                    duration: 200,
                    useNativeDriver: true
                })
            ]).start();
        }
    }, [card, isVerifying, fadeAnimation, scaleAnimation]);

    if (!card && !isVerifying) return null;

    return (
        <Animated.View 
            style={[
                styles.container,
                { 
                    opacity: fadeAnimation,
                    transform: [{ scale: scaleAnimation }]
                }
            ]}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Card Verification</Text>
                {isVerifying && (
                    <View style={styles.verifyingIndicator}>
                        <Text style={styles.verifyingText}>Verifying</Text>
                    </View>
                )}
                {isVerified !== null && (
                    <View style={[
                        styles.verificationBadge,
                        isVerified ? styles.verifiedBadge : styles.failedBadge
                    ]}>
                        <Icon 
                            name={isVerified ? 'check-circle' : 'alert-circle'} 
                            size={16} 
                            color="#fff" 
                        />
                        <Text style={styles.verificationText}>
                            {isVerified ? 'Verified' : 'Low Match'}
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.content}>
                {card && (
                    <>
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Detected:</Text>
                            <Text style={styles.value} numberOfLines={1}>{card.name}</Text>
                        </View>
                        
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>OCR Text:</Text>
                            <Text style={styles.value} numberOfLines={2}>{originalText}</Text>
                        </View>
                        
                        <View style={styles.infoRow}>
                            <Text style={styles.label}>Set:</Text>
                            <Text style={styles.value} numberOfLines={1}>{card.setName} ({card.setCode})</Text>
                        </View>
                        
                        <View style={styles.scoreContainer}>
                            <Text style={styles.scoreLabel}>Match Score:</Text>
                            <View style={styles.scoreBarContainer}>
                                <View 
                                    style={[
                                        styles.scoreBar,
                                        { 
                                            width: `${Math.min(100, verificationScore * 100)}%`,
                                            backgroundColor: getScoreColor(verificationScore)
                                        }
                                    ]} 
                                />
                            </View>
                            <Text style={styles.scoreValue}>{Math.round(verificationScore * 100)}%</Text>
                        </View>
                    </>
                )}
                
                {isVerifying && !card && (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Analyzing card text...</Text>
                    </View>
                )}
            </View>
        </Animated.View>
    );
};

const getScoreColor = (score: number): string => {
    if (score >= 0.7) return '#4CAF50'; // Green
    if (score >= 0.5) return '#FFC107'; // Yellow
    return '#F44336'; // Red
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 10,
        left: 210,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 12,
        padding: 16,
        elevation: 8,
        zIndex: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        width: '50%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        paddingBottom: 8,
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    verifyingIndicator: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    verifyingText: {
        color: 'white',
        fontSize: 12,
    },
    verificationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    verifiedBadge: {
        backgroundColor: '#4CAF50',
    },
    failedBadge: {
        backgroundColor: '#F44336',
    },
    verificationText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    },
    content: {
        gap: 8,
    },
    infoRow: {
        flexDirection: 'row',
    },
    label: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        width: 80,
    },
    value: {
        color: 'white',
        fontSize: 14,
        flex: 1,
    },
    scoreContainer: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    scoreLabel: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        width: 100,
    },
    scoreBarContainer: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    scoreBar: {
        height: '100%',
    },
    scoreValue: {
        color: 'white',
        fontSize: 14,
        marginLeft: 8,
        width: 40,
        textAlign: 'right',
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    loadingText: {
        color: 'white',
        fontSize: 16,
    },
});

export default CardVersionChecker; 