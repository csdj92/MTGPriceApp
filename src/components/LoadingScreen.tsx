import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../context/ThemeContext';

interface LoadingScreenProps {
    message?: string;
    error?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...', error }) => {
    const { theme, isDark } = useTheme();
    const title = error ? 'Startup Problem' : 'Preparing Lorcana Library';
    const helperText = error
        ? 'Please try again. If the problem persists, contact support.'
        : 'This runs on first launch and whenever new set data needs to sync.';
    const backgroundColor = isDark ? '#090c12' : theme.background;
    const overlayColor = isDark ? 'rgba(4, 7, 12, 0.92)' : 'rgba(15, 23, 42, 0.12)';
    const cardBackground = isDark ? 'rgba(24, 28, 38, 0.96)' : theme.surface;
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border;
    const shadowColor = isDark ? '#000000' : 'rgba(15, 23, 42, 0.22)';
    const accentColor = error ? theme.error : theme.primary;

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <StatusBar barStyle={theme.statusBar} backgroundColor={backgroundColor} />

            <View style={[styles.ambientOrb, styles.ambientOrbTop, { backgroundColor: `${theme.primary}22` }]} />
            <View style={[styles.ambientOrb, styles.ambientOrbBottom, { backgroundColor: `${theme.secondary}1f` }]} />

            <View style={[styles.overlay, { backgroundColor: overlayColor }]}>
                <View
                    style={[
                        styles.modalCard,
                        {
                            backgroundColor: cardBackground,
                            borderColor,
                            shadowColor,
                        },
                    ]}
                >
                    <LinearGradient
                        colors={[`${accentColor}26`, 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardGlow}
                    />

                    <View style={[styles.spinnerBadge, { backgroundColor: `${accentColor}20` }]}>
                        <ActivityIndicator size="small" color={accentColor} />
                    </View>

                    <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                    <Text style={[styles.message, { color: theme.textSecondary || theme.text }]}>
                        {error ? `Error: ${error}` : message}
                    </Text>
                    <Text style={[styles.helperText, { color: theme.textTertiary || theme.textSecondary || theme.text }]}>
                        {helperText}
                    </Text>

                    {!error && (
                        <View style={styles.progressRow}>
                            <View style={[styles.progressDot, { backgroundColor: accentColor }]} />
                            <View style={[styles.progressDot, { backgroundColor: `${accentColor}99` }]} />
                            <View style={[styles.progressDot, { backgroundColor: `${accentColor}55` }]} />
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    ambientOrb: {
        position: 'absolute',
        width: 240,
        height: 240,
        borderRadius: 120,
    },
    ambientOrbTop: {
        top: -40,
        right: -50,
    },
    ambientOrbBottom: {
        bottom: -80,
        left: -70,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 22,
        borderWidth: 1,
        paddingHorizontal: 24,
        paddingVertical: 26,
        alignItems: 'center',
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.28,
        shadowRadius: 30,
        elevation: 14,
    },
    cardGlow: {
        ...StyleSheet.absoluteFillObject,
    },
    spinnerBadge: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    message: {
        marginTop: 10,
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
    helperText: {
        marginTop: 12,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 18,
    },
    progressDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});

export default LoadingScreen;
