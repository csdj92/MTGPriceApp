import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    PanResponder,
    Dimensions,
    FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FastImage from '@d11/react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource } from '../../utils/imageUtils';
import { formatLorcanaRarity, getLorcanaRarityColor } from '../../utils/formatters';
import { Icon } from '../../utils/icons';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;
const CARD_WIDTH = SCREEN_WIDTH * 0.68;
const CARD_HEIGHT = CARD_WIDTH / 0.714;
const FILMSTRIP_ITEM_WIDTH = 40; // 36px card + 4px margin

// Per-ink-color visual theme
const INK_THEMES: Record<string, { accent: string; glow: string; bg: string[] }> = {
    amber:    { accent: '#F5A623', glow: '#F5A62350', bg: ['#1E1000', '#0A0800'] },
    amethyst: { accent: '#B06AE0', glow: '#B06AE050', bg: ['#140820', '#070310'] },
    emerald:  { accent: '#2ECC71', glow: '#2ECC7150', bg: ['#071A0E', '#030D07'] },
    ruby:     { accent: '#E74C3C', glow: '#E74C3C50', bg: ['#1E0808', '#0A0303'] },
    sapphire: { accent: '#3498DB', glow: '#3498DB50', bg: ['#061220', '#020810'] },
    steel:    { accent: '#AAB7B8', glow: '#AAB7B850', bg: ['#0E1010', '#060808'] },
};

function getInkTheme(color: string | undefined) {
    if (!color) return INK_THEMES.steel;
    const key = color.toLowerCase().trim();
    return INK_THEMES[key] ?? INK_THEMES.steel;
}

interface LorcanaCardShowcaseProps {
    cards: LorcanaCardWithPrice[];
    initialIndex?: number;
    priceCache: Record<string, any>;
    priceLoading: Record<string, boolean>;
    onCardPress: (card: LorcanaCardWithPrice) => void;
    onClose: () => void;
    newToCollectionCards?: Set<string>;
}

const LorcanaCardShowcase: React.FC<LorcanaCardShowcaseProps> = ({
    cards,
    initialIndex = 0,
    priceCache,
    priceLoading,
    onCardPress,
    onClose,
    newToCollectionCards = new Set(),
}) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const safeInitial = Math.min(Math.max(0, initialIndex), cards.length - 1);
    const [currentIndex, setCurrentIndex] = useState(safeInitial);
    const currentIndexRef = useRef(safeInitial);
    const isAnimatingRef = useRef(false);
    const cardsRef = useRef(cards);
    useEffect(() => { cardsRef.current = cards; }, [cards]);

    const filmstripRef = useRef<FlatList>(null);

    // Animated values
    const cardTranslateX = useRef(new Animated.Value(0)).current;
    const cardOpacity    = useRef(new Animated.Value(0)).current;
    const cardScale      = useRef(new Animated.Value(0.88)).current;
    const infoOpacity    = useRef(new Animated.Value(0)).current;
    const infoTranslateY = useRef(new Animated.Value(24)).current;
    const glowOpacity    = useRef(new Animated.Value(0.3)).current;

    // Entrance animation on mount
    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.spring(cardScale, { toValue: 1, tension: 58, friction: 9, useNativeDriver: true }),
                Animated.timing(cardOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(infoOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
                Animated.spring(infoTranslateY, { toValue: 0, tension: 75, friction: 10, useNativeDriver: true }),
            ]),
        ]).start();

        // Glow pulse loop
        const glowLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(glowOpacity, { toValue: 0.85, duration: 2200, useNativeDriver: true }),
                Animated.timing(glowOpacity, { toValue: 0.3,  duration: 2200, useNativeDriver: true }),
            ])
        );
        glowLoop.start();
        return () => glowLoop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const navigateTo = useCallback((nextIndex: number, direction: 'left' | 'right') => {
        if (isAnimatingRef.current) return;
        const total = cardsRef.current.length;
        if (nextIndex < 0 || nextIndex >= total) return;

        isAnimatingRef.current = true;
        const outX = direction === 'left' ? -SCREEN_WIDTH * 1.3 : SCREEN_WIDTH * 1.3;
        const inX  = direction === 'left' ?  SCREEN_WIDTH * 1.3 : -SCREEN_WIDTH * 1.3;

        // Info fades out quickly
        Animated.parallel([
            Animated.timing(infoOpacity,    { toValue: 0,  duration: 100, useNativeDriver: true }),
            Animated.timing(infoTranslateY, { toValue: 16, duration: 100, useNativeDriver: true }),
        ]).start();

        // Card exits
        Animated.parallel([
            Animated.timing(cardTranslateX, { toValue: outX, duration: 250, useNativeDriver: true }),
            Animated.timing(cardOpacity,    { toValue: 0,    duration: 180, useNativeDriver: true }),
            Animated.timing(cardScale,      { toValue: 0.82, duration: 250, useNativeDriver: true }),
        ]).start(() => {
            currentIndexRef.current = nextIndex;
            setCurrentIndex(nextIndex);

            // Reset to incoming position
            cardTranslateX.setValue(inX);
            cardOpacity.setValue(0);
            cardScale.setValue(0.82);

            // Scroll filmstrip
            try {
                filmstripRef.current?.scrollToIndex({
                    index: nextIndex,
                    viewPosition: 0.5,
                    animated: true,
                });
            } catch (_) {}

            // Card enters with spring
            Animated.parallel([
                Animated.spring(cardTranslateX, { toValue: 0, tension: 68, friction: 10, useNativeDriver: true }),
                Animated.spring(cardScale,       { toValue: 1, tension: 68, friction: 10, useNativeDriver: true }),
                Animated.timing(cardOpacity,     { toValue: 1, duration: 220, useNativeDriver: true }),
            ]).start(() => {
                // Info slides back up
                infoTranslateY.setValue(-12);
                Animated.parallel([
                    Animated.timing(infoOpacity,    { toValue: 1, duration: 260, useNativeDriver: true }),
                    Animated.spring(infoTranslateY, { toValue: 0, tension: 78, friction: 10, useNativeDriver: true }),
                ]).start();
                isAnimatingRef.current = false;
            });
        });
    }, [cardTranslateX, cardOpacity, cardScale, infoOpacity, infoTranslateY]);

    const navigateToRef = useRef(navigateTo);
    useEffect(() => { navigateToRef.current = navigateTo; }, [navigateTo]);

    // PanResponder for swipe gesture
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, { dx, dy }) =>
                Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5,
            onPanResponderMove: (_, { dx }) => {
                if (isAnimatingRef.current) return;
                cardTranslateX.setValue(dx * 0.9);
                const scale = 1 - Math.abs(dx) / (SCREEN_WIDTH * 2.8);
                cardScale.setValue(Math.max(0.82, scale));
            },
            onPanResponderRelease: (_, { dx, vx }) => {
                if (isAnimatingRef.current) return;
                const idx = currentIndexRef.current;
                const total = cardsRef.current.length;

                if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(vx) > 0.65) {
                    // Reset animated values before navigateTo takes over
                    cardTranslateX.setValue(0);
                    cardScale.setValue(1);
                    if (dx < 0 && idx < total - 1) {
                        navigateToRef.current(idx + 1, 'left');
                    } else if (dx > 0 && idx > 0) {
                        navigateToRef.current(idx - 1, 'right');
                    } else {
                        // Edge — bounce back
                        Animated.parallel([
                            Animated.spring(cardTranslateX, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
                            Animated.spring(cardScale,       { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
                        ]).start();
                    }
                } else {
                    Animated.parallel([
                        Animated.spring(cardTranslateX, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
                        Animated.spring(cardScale,       { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
                    ]).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.parallel([
                    Animated.spring(cardTranslateX, { toValue: 0, tension: 80, friction: 8, useNativeDriver: true }),
                    Animated.spring(cardScale,       { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
                ]).start();
            },
        })
    ).current;

    if (!cards.length) return null;
    const card = cards[currentIndex];
    if (!card) return null;

    const inkTheme = getInkTheme(card.Color);
    const priceData = priceCache[card.Unique_ID || card.Name];
    const normalPrice = priceData?.usd ?? card.price_usd ?? card.prices?.usd;
    const foilPrice   = priceData?.usd_foil ?? card.price_usd_foil ?? card.prices?.usd_foil;
    const displayPrice = normalPrice || foilPrice;
    const rarityColor = getLorcanaRarityColor(card.Rarity, inkTheme.accent);

    const canGoBack    = currentIndex > 0;
    const canGoForward = currentIndex < cards.length - 1;

    // Filmstrip
    const renderFilmstripItem = ({ item, index }: { item: LorcanaCardWithPrice; index: number }) => {
        const isActive = index === currentIndex;
        return (
            <TouchableOpacity
                style={[styles.filmThumb, isActive && { borderColor: inkTheme.accent }]}
                onPress={() => {
                    const dir = index > currentIndexRef.current ? 'left' : 'right';
                    navigateToRef.current(index, dir);
                }}
                activeOpacity={0.75}
            >
                <FastImage
                    source={getImageSource(item.Image) || { uri: item.Image }}
                    style={[styles.filmThumbImg, !isActive && styles.filmThumbInactive]}
                    resizeMode={FastImage.resizeMode.cover}
                />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Deep background gradient tinted by ink color */}
            <LinearGradient
                colors={['#070709', inkTheme.bg[0], inkTheme.bg[1], '#070709']}
                locations={[0, 0.4, 0.75, 1]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Ambient glow orb behind card */}
            <Animated.View
                style={[
                    styles.glowOrb,
                    { backgroundColor: inkTheme.glow, opacity: glowOpacity },
                ]}
            />

            {/* Header */}
            <View style={[styles.header, { paddingTop: 14 + insets.top }]}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
                    <Icon name="arrow-left" size={20} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <Text style={styles.counter}>{currentIndex + 1} / {cards.length}</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Card display area — receives swipe gestures */}
            <View style={styles.cardArea} {...panResponder.panHandlers}>
                {/* Left nav arrow */}
                {canGoBack && (
                    <TouchableOpacity
                        style={[styles.navArrow, styles.navLeft]}
                        onPress={() => navigateTo(currentIndex - 1, 'right')}
                        activeOpacity={0.7}
                    >
                        <Icon name="chevron-left" size={28} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                )}

                {/* Right nav arrow */}
                {canGoForward && (
                    <TouchableOpacity
                        style={[styles.navArrow, styles.navRight]}
                        onPress={() => navigateTo(currentIndex + 1, 'left')}
                        activeOpacity={0.7}
                    >
                        <Icon name="chevron-right" size={28} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                )}

                {/* Animated card */}
                <Animated.View
                    style={[
                        styles.cardWrapper,
                        {
                            transform: [
                                { translateX: cardTranslateX },
                                { scale: cardScale },
                            ],
                            opacity: cardOpacity,
                        },
                    ]}
                    pointerEvents="box-none"
                >
                    {/* Glow shadow layer (iOS shadow / Android elevation combo) */}
                    <View style={[styles.cardShadow, { shadowColor: inkTheme.accent }]} />

                    <TouchableOpacity onPress={() => onCardPress(card)} activeOpacity={0.9}>
                        <FastImage
                            source={getImageSource(card.Image) || { uri: card.Image }}
                            style={[
                                styles.cardImage,
                                !card.collected && styles.cardImageUncollected,
                            ]}
                            resizeMode={FastImage.resizeMode.contain}
                        />
                    </TouchableOpacity>

                    {/* "Not collected" badge */}
                    {!card.collected && (
                        <View style={styles.uncollectedBadge}>
                            <Text style={styles.uncollectedText}>NOT IN COLLECTION</Text>
                        </View>
                    )}

                    {/* "New" ribbon */}
                    {newToCollectionCards.has(card.Unique_ID) && (
                        <View style={[styles.newBadge, { backgroundColor: inkTheme.accent }]}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                    )}
                </Animated.View>
            </View>

            {/* Card info — fades/slides in after card settles */}
            <Animated.View
                style={[
                    styles.infoSection,
                    { opacity: infoOpacity, transform: [{ translateY: infoTranslateY }] },
                ]}
                pointerEvents="none"
            >
                <Text style={styles.cardName} numberOfLines={1}>{card.Name}</Text>

                {/* Ink color / rarity / type pills */}
                <View style={styles.pillRow}>
                    {card.Color ? (
                        <View style={[styles.pill, { borderColor: inkTheme.accent + '90' }]}>
                            <Text style={[styles.pillText, { color: inkTheme.accent }]}>
                                {card.Color}
                            </Text>
                        </View>
                    ) : null}
                    {card.Rarity ? (
                        <View style={[styles.pill, { borderColor: rarityColor + '90' }]}>
                            <Text style={[styles.pillText, { color: rarityColor }]}>
                                {formatLorcanaRarity(card.Rarity)}
                            </Text>
                        </View>
                    ) : null}
                    {card.Type ? (
                        <View style={[styles.pill, { borderColor: 'rgba(255,255,255,0.2)' }]}>
                            <Text style={[styles.pillText, { color: 'rgba(255,255,255,0.55)' }]}>
                                {card.Type}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                    {card.Cost !== undefined && (
                        <View style={styles.statChip}>
                            <Icon name="circle-multiple" size={13} color={inkTheme.accent} />
                            <Text style={styles.statNum}>{card.Cost}</Text>
                            <Text style={styles.statLbl}>Cost</Text>
                        </View>
                    )}
                    {card.Strength !== undefined && (
                        <View style={styles.statChip}>
                            <Icon name="sword" size={13} color="#FF7675" />
                            <Text style={styles.statNum}>{card.Strength}</Text>
                            <Text style={styles.statLbl}>STR</Text>
                        </View>
                    )}
                    {card.Willpower !== undefined && (
                        <View style={styles.statChip}>
                            <Icon name="shield" size={13} color="#74B9FF" />
                            <Text style={styles.statNum}>{card.Willpower}</Text>
                            <Text style={styles.statLbl}>WIL</Text>
                        </View>
                    )}
                    {card.Lore !== undefined && (
                        <View style={styles.statChip}>
                            <Icon name="book-open-variant" size={13} color="#FDCB6E" />
                            <Text style={styles.statNum}>{card.Lore}</Text>
                            <Text style={styles.statLbl}>Lore</Text>
                        </View>
                    )}
                    {displayPrice ? (
                        <View style={[styles.statChip, styles.priceChip, { borderColor: inkTheme.accent + '50' }]}>
                            <Text style={[styles.priceNum, { color: inkTheme.accent }]}>
                                ${Number(displayPrice).toFixed(2)}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <Text style={styles.tapHint}>TAP CARD FOR FULL DETAILS  ·  SWIPE TO BROWSE</Text>
            </Animated.View>

            {/* Filmstrip navigator */}
            <View style={[styles.filmstripContainer, { paddingBottom: 10 + insets.bottom, height: 58 + insets.bottom }]}>
                <FlatList
                    ref={filmstripRef}
                    data={cards}
                    renderItem={renderFilmstripItem}
                    keyExtractor={(item) => item.Unique_ID || item.Name}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filmstripContent}
                    getItemLayout={(_, index) => ({
                        length: FILMSTRIP_ITEM_WIDTH,
                        offset: FILMSTRIP_ITEM_WIDTH * index,
                        index,
                    })}
                    initialScrollIndex={Math.max(0, safeInitial - 3)}
                    onScrollToIndexFailed={() => {}}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#070709',
    },
    glowOrb: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.85,
        height: SCREEN_WIDTH * 0.85,
        borderRadius: SCREEN_WIDTH * 0.425,
        top: '10%',
        left: '7.5%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 6,
    },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.09)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    counter: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
    },
    headerSpacer: {
        width: 38,
    },

    // Card area
    cardArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navArrow: {
        position: 'absolute',
        top: '50%',
        marginTop: -22,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.07)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    navLeft:  { left: 6 },
    navRight: { right: 6 },

    cardWrapper: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardShadow: {
        position: 'absolute',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.7,
        shadowRadius: 24,
        elevation: 16,
    },
    cardImage: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
    },
    cardImageUncollected: {
        opacity: 0.55,
    },
    uncollectedBadge: {
        position: 'absolute',
        bottom: 14,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 4,
    },
    uncollectedText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    newBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    newBadgeText: {
        color: '#000',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
    },

    // Info section
    infoSection: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        alignItems: 'center',
    },
    cardName: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: 0.3,
        textAlign: 'center',
        marginBottom: 6,
        textShadowColor: 'rgba(0,0,0,0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    pillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 8,
    },
    pill: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 20,
        borderWidth: 1,
    },
    pillText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    statsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 8,
    },
    statChip: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 9,
        gap: 1,
    },
    statNum: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    statLbl: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 8,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    priceChip: {
        borderWidth: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    priceNum: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    tapHint: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 9,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginTop: 2,
    },

    // Filmstrip
    filmstripContainer: {
        // height and paddingBottom are applied inline with safe area insets
    },
    filmstripContent: {
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    filmThumb: {
        width: 36,
        height: 48,
        borderRadius: 4,
        overflow: 'hidden',
        marginRight: 4,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    filmThumbImg: {
        width: '100%',
        height: '100%',
    },
    filmThumbInactive: {
        opacity: 0.35,
    },
});

export default LorcanaCardShowcase;
