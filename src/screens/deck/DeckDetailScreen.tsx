import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import {
    getDeckCards,
    addCardToDeck,
    setCardQuantity,
    removeCardFromDeck,
    getDeckStats,
    getCollectedCards,
    DECK_SIZE,
    MAX_COPIES,
    type DeckStats,
} from '../../services/DeckService';
import type { LorcanaCard, LorcanaCardWithPrice, LorcanaDeckCardWithCard } from '../../types/lorcana';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import CardSearch from '../../components/CardSearch';
import LorcanaCardModal from '../../components/lorcana/LorcanaCardModal';
import { getImageSource } from '../../utils/imageUtils';
import { INK_COLOR_MAP } from '../../utils/formatters';
import { Icon } from '../../utils/icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Stats bar ──────────────────────────────────────────────────────────────────

const StatsBar: React.FC<{ stats: DeckStats; theme: any }> = ({ stats, theme }) => {
    const progress = Math.min(stats.totalCards / DECK_SIZE, 1);
    const barColor = stats.isLegal ? '#28a745' : stats.totalCards > DECK_SIZE ? '#dc3545' : theme.primary;

    return (
        <View style={[statsStyles.container, { backgroundColor: theme.card || theme.surface, borderColor: theme.border }]}>
            {/* Progress bar */}
            <View style={[statsStyles.progressTrack, { backgroundColor: theme.border }]}>
                <View style={[statsStyles.progressFill, { width: `${progress * 100}%`, backgroundColor: barColor }]} />
            </View>

            <View style={statsStyles.row}>
                <View style={statsStyles.stat}>
                    <Text style={[statsStyles.statValue, { color: barColor }]}>{stats.totalCards}</Text>
                    <Text style={[statsStyles.statLabel, { color: theme.textSecondary || theme.text }]}>/ {DECK_SIZE}</Text>
                </View>

                <View style={statsStyles.inkRow}>
                    {stats.inkColors.map(ink => (
                        <View
                            key={ink}
                            style={[statsStyles.inkDot, { backgroundColor: INK_COLOR_MAP[ink] ?? '#999' }]}
                        />
                    ))}
                    {stats.inkColors.length === 0 && (
                        <Text style={[statsStyles.statLabel, { color: theme.textSecondary || theme.text }]}>No ink</Text>
                    )}
                </View>

                <View style={statsStyles.stat}>
                    <Text style={[statsStyles.statValue, { color: theme.text }]}>${stats.totalValue.toFixed(2)}</Text>
                    <Text style={[statsStyles.statLabel, { color: theme.textSecondary || theme.text }]}>value</Text>
                </View>
            </View>

            {stats.violations.length > 0 && (
                <View style={statsStyles.violations}>
                    {stats.violations.map((v, i) => (
                        <Text key={i} style={statsStyles.violationText}>⚠ {v}</Text>
                    ))}
                </View>
            )}

            {stats.isLegal && (
                <Text style={statsStyles.legalBadge}>✓ Legal deck</Text>
            )}
        </View>
    );
};

const statsStyles = StyleSheet.create({
    container: {
        margin: 16,
        marginBottom: 8,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
    },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        marginBottom: 12,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 2,
    },
    statValue: { fontSize: 18, fontWeight: 'bold' },
    statLabel: { fontSize: 13 },
    inkRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    inkDot: { width: 14, height: 14, borderRadius: 7 },
    violations: { marginTop: 10, gap: 2 },
    violationText: { fontSize: 12, color: '#dc3545' },
    legalBadge: { marginTop: 8, fontSize: 12, color: '#28a745', fontWeight: '600' },
});

// ── Card row ───────────────────────────────────────────────────────────────────

const DeckCardRow: React.FC<{
    entry: LorcanaDeckCardWithCard;
    onIncrease: () => void;
    onDecrease: () => void;
    onRemove: () => void;
    theme: any;
}> = React.memo(({ entry, onIncrease, onDecrease, onRemove, theme }) => {
    const { card, quantity } = entry;
    const inkColor = INK_COLOR_MAP[(card.Color ?? '').toLowerCase().split(/[/,|& ]+/)[0]?.trim()] ?? '#999';
    const atMax = quantity >= MAX_COPIES;

    return (
        <View style={[rowStyles.container, { backgroundColor: theme.card || theme.surface, borderColor: theme.border }]}>
            <FastImage
                source={getImageSource(card.Image) || { uri: card.Image }}
                style={rowStyles.image}
                resizeMode={FastImage.resizeMode.cover}
            />

            <View style={rowStyles.info}>
                <View style={rowStyles.nameRow}>
                    <View style={[rowStyles.colorDot, { backgroundColor: inkColor }]} />
                    <Text style={[rowStyles.name, { color: theme.text }]} numberOfLines={1}>
                        {card.Name}
                    </Text>
                </View>
                <Text style={[rowStyles.meta, { color: theme.textSecondary || theme.text }]}>
                    {card.Set_ID} · Cost {card.Cost} · {card.Rarity}
                </Text>
                {card.price_usd && (
                    <Text style={[rowStyles.price, { color: theme.success || '#28a745' }]}>
                        ${parseFloat(card.price_usd).toFixed(2)} ea
                    </Text>
                )}
            </View>

            <View style={rowStyles.controls}>
                <TouchableOpacity onPress={onDecrease} style={[rowStyles.qtyBtn, { backgroundColor: '#dc3545' }]}>
                    <Icon name="minus" size={14} color="#fff" />
                </TouchableOpacity>
                <Text style={[rowStyles.qty, { color: atMax ? '#dc3545' : theme.text }]}>{quantity}</Text>
                <TouchableOpacity
                    onPress={onIncrease}
                    style={[rowStyles.qtyBtn, { backgroundColor: atMax ? theme.border : '#28a745' }]}
                    disabled={atMax}
                >
                    <Icon name="plus" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onRemove} style={rowStyles.removeBtn}>
                    <Icon name="trash-can-outline" size={18} color={theme.textSecondary || '#999'} />
                </TouchableOpacity>
            </View>
        </View>
    );
});

const rowStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    image: { width: 44, height: 60 },
    info: { flex: 1, padding: 10 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    colorDot: { width: 10, height: 10, borderRadius: 5 },
    name: { flex: 1, fontSize: 14, fontWeight: '600' },
    meta: { fontSize: 12, marginBottom: 2 },
    price: { fontSize: 12, fontWeight: '600' },
    controls: { flexDirection: 'row', alignItems: 'center', paddingRight: 10, gap: 6 },
    qtyBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qty: { fontSize: 16, fontWeight: 'bold', minWidth: 22, textAlign: 'center' },
    removeBtn: { padding: 4 },
});

// ── All 6 ink colors for the filter chips ─────────────────────────────────────

const ALL_INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel'] as const;

// ── Keyword extraction ─────────────────────────────────────────────────────────

const LORCANA_KEYWORDS = [
    'Sing Together', 'Challenger', 'Resist', 'Singer', 'Shift',
    'Evasive', 'Rush', 'Bodyguard', 'Ward', 'Reckless',
    'Vanish', 'Support', 'Pupil', 'Bite', 'Probe', 'Inspire',
];

const extractKeywords = (bodyText?: string): string[] => {
    if (!bodyText) return [];
    const found: string[] = [];
    for (const kw of LORCANA_KEYWORDS) {
        const regex = new RegExp(`\\b${kw}(\\s[+\\-]?\\d+)?`, 'i');
        const match = bodyText.match(regex);
        if (match) found.push(match[0]);
    }
    return found;
};

// ── My-collection card row (compact, just tap to add) ─────────────────────────

const CollectionCardRow: React.FC<{
    card: LorcanaCard;
    onAdd: () => void;
    onView: () => void;
    isAdded: boolean;
    theme: any;
}> = React.memo(({ card, onAdd, onView, isAdded, theme }) => {
    const dot = INK_COLOR_MAP[(card.Color ?? '').toLowerCase().split(/[/,|& ]+/)[0]?.trim()] ?? '#999';
    const keywords = extractKeywords(card.Body_Text);

    return (
        <TouchableOpacity
            style={[pickStyles.row, { backgroundColor: theme.card || theme.surface, borderColor: theme.border }]}
            onPress={onView}
            activeOpacity={0.75}
        >
            <FastImage
                source={getImageSource(card.Image) || { uri: card.Image }}
                style={pickStyles.img}
                resizeMode={FastImage.resizeMode.cover}
            />
            <View style={pickStyles.info}>
                <View style={pickStyles.nameRow}>
                    <View style={[pickStyles.dot, { backgroundColor: dot }]} />
                    <Text style={[pickStyles.name, { color: theme.text }]} numberOfLines={1}>{card.Name}</Text>
                </View>
                <Text style={[pickStyles.meta, { color: theme.textSecondary || theme.text }]}>
                    {card.Set_ID} · Cost {card.Cost} · {card.Rarity}
                </Text>
                {keywords.length > 0 && (
                    <View style={pickStyles.keywordRow}>
                        {keywords.map(kw => (
                            <View key={kw} style={[pickStyles.kwChip, { backgroundColor: theme.border }]}>
                                <Text style={[pickStyles.kwText, { color: theme.text }]}>{kw}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
            <TouchableOpacity
                style={[pickStyles.addBtn, { backgroundColor: isAdded ? '#28a745' : theme.primary }]}
                onPress={onAdd}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <Icon name={isAdded ? 'check' : 'plus'} size={18} color="#fff" />
            </TouchableOpacity>
        </TouchableOpacity>
    );
});

const pickStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    img: { width: 38, height: 52 },
    info: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    name: { flex: 1, fontSize: 13, fontWeight: '600' },
    meta: { fontSize: 11 },
    keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    kwChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    kwText: { fontSize: 10, fontWeight: '600' },
    addBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
});

// ── Tabbed add-card modal ─────────────────────────────────────────────────────

const AddCardModal: React.FC<{
    visible: boolean;
    onClose: () => void;
    onAdd: (card: any) => void;
    deckInkColors: string[];   // colors already in the deck
    theme: any;
}> = ({ visible, onClose, onAdd, deckInkColors, theme }) => {
    const [tab, setTab] = useState<'search' | 'collection'>('search');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [collectionCards, setCollectionCards] = useState<LorcanaCard[]>([]);
    const [loadingCollection, setLoadingCollection] = useState(false);
    const [previewCard, setPreviewCard] = useState<LorcanaCardWithPrice | null>(null);
    const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

    const handleCollectionAdd = useCallback((card: LorcanaCard) => {
        onAdd(card);
        const id = card.Unique_ID;
        setJustAdded(prev => new Set(prev).add(id));
        setTimeout(() => {
            setJustAdded(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 1500);
    }, [onAdd]);

    // When modal opens, set filter to deck's current ink colors (if exactly 2)
    useEffect(() => {
        if (visible) {
            setActiveFilters(deckInkColors.length === 2 ? [...deckInkColors] : []);
        }
    }, [visible, deckInkColors]);

    // Load collection cards whenever the collection tab is opened or filters change
    useEffect(() => {
        if (!visible || tab !== 'collection') return;
        let cancelled = false;
        setLoadingCollection(true);
        getCollectedCards(activeFilters).then(cards => {
            if (!cancelled) {
                setCollectionCards(cards);
                setLoadingCollection(false);
            }
        });
        return () => { cancelled = true; };
    }, [visible, tab, activeFilters]);

    const toggleFilter = (ink: string) => {
        setActiveFilters(prev =>
            prev.includes(ink) ? prev.filter(c => c !== ink) : [...prev, ink]
        );
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[addStyles.container, { backgroundColor: theme.background }]}>

                {/* Header */}
                <View style={[addStyles.header, { borderBottomColor: theme.border }]}>
                    <Text style={[addStyles.title, { color: theme.text }]}>Add Card to Deck</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Icon name="close" size={24} color={theme.text} />
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={[addStyles.tabRow, { borderBottomColor: theme.border }]}>
                    {(['search', 'collection'] as const).map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[addStyles.tab, tab === t && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
                            onPress={() => setTab(t)}
                        >
                            <Icon
                                name={t === 'search' ? 'magnify' : 'cards-heart'}
                                size={16}
                                color={tab === t ? theme.primary : (theme.textSecondary || theme.text)}
                            />
                            <Text style={[addStyles.tabText, { color: tab === t ? theme.primary : (theme.textSecondary || theme.text) }]}>
                                {t === 'search' ? 'All Cards' : 'My Cards'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Ink color filter chips — shown on My Cards tab */}
                {tab === 'collection' && (
                    <View style={addStyles.filterRow}>
                        {deckInkColors.length === 2 && (
                            <Text style={[addStyles.filterHint, { color: theme.textSecondary || theme.text }]}>
                                Auto-filtered to deck colors:
                            </Text>
                        )}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={addStyles.chips}>
                            {ALL_INKS.map(ink => {
                                const active = activeFilters.includes(ink);
                                const color = INK_COLOR_MAP[ink];
                                return (
                                    <TouchableOpacity
                                        key={ink}
                                        style={[
                                            addStyles.chip,
                                            { borderColor: color },
                                            active && { backgroundColor: color },
                                        ]}
                                        onPress={() => toggleFilter(ink)}
                                    >
                                        <View style={[addStyles.chipDot, { backgroundColor: active ? '#fff' : color }]} />
                                        <Text style={[addStyles.chipText, { color: active ? '#fff' : color }]}>
                                            {ink.charAt(0).toUpperCase() + ink.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* Content */}
                {tab === 'search' ? (
                    <CardSearch
                        onCardSelect={(card) => {
                            onAdd(card);
                            onClose();
                        }}
                        placeholder="Search for a card..."
                        autoFocus
                        showResults
                    />
                ) : (
                    loadingCollection ? (
                        <View style={addStyles.loading}>
                            <Text style={[addStyles.loadingText, { color: theme.textSecondary || theme.text }]}>
                                Loading your cards...
                            </Text>
                        </View>
                    ) : collectionCards.length === 0 ? (
                        <View style={addStyles.loading}>
                            <Icon name="cards-outline" size={48} color={theme.border} />
                            <Text style={[addStyles.loadingText, { color: theme.textSecondary || theme.text }]}>
                                {activeFilters.length > 0
                                    ? 'No collected cards match these colors'
                                    : 'No cards in your collection yet'}
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={collectionCards}
                            keyExtractor={c => c.Unique_ID}
                            contentContainerStyle={{ paddingVertical: 8 }}
                            renderItem={({ item }) => (
                                <CollectionCardRow
                                    card={item}
                                    theme={theme}
                                    isAdded={justAdded.has(item.Unique_ID)}
                                    onAdd={() => handleCollectionAdd(item)}
                                    onView={() => setPreviewCard(item as LorcanaCardWithPrice)}
                                />
                            )}
                        />
                    )
                )}
            </View>

            {/* Card detail preview — opens on top of this modal */}
            <LorcanaCardModal
                card={previewCard}
                visible={!!previewCard}
                onClose={() => setPreviewCard(null)}
                onDelete={() => setPreviewCard(null)}
                addLabel="Add to Deck"
                onAddToCollection={() => {
                    if (previewCard) {
                        handleCollectionAdd(previewCard);
                        setPreviewCard(null);
                    }
                }}
            />
        </Modal>
    );
};

const addStyles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    title: { fontSize: 18, fontWeight: 'bold' },
    tabRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: { fontSize: 14, fontWeight: '600' },
    filterRow: {
        paddingTop: 10,
        paddingHorizontal: 12,
        paddingBottom: 6,
    },
    filterHint: { fontSize: 11, marginBottom: 6 },
    chips: { gap: 8, paddingBottom: 4 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipText: { fontSize: 12, fontWeight: '600' },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

interface DeckDetailScreenProps {
    route: { params: { deckId: string; deckName: string } };
}

const DeckDetailScreen: React.FC<DeckDetailScreenProps> = ({ route }) => {
    const { deckId, deckName } = route.params;
    const { theme } = useTheme();
    const navigation = useNavigation<Nav>();
    const [entries, setEntries] = useState<LorcanaDeckCardWithCard[]>([]);
    const [stats, setStats] = useState<DeckStats>({
        totalCards: 0, uniqueCards: 0, inkColors: [], totalValue: 0, isLegal: false, violations: [`0/${DECK_SIZE} cards`],
    });
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        navigation.setOptions({ title: deckName });
    }, [deckName, navigation]);

    const loadCards = useCallback(async () => {
        const cards = await getDeckCards(deckId);
        setEntries(cards);
        setStats(getDeckStats(cards));
    }, [deckId]);

    useFocusEffect(useCallback(() => {
        loadCards();
    }, [loadCards]));

    const handleAdd = async (card: any) => {
        const cardId = card.Unique_ID ?? card.id;
        if (!cardId) return;
        await addCardToDeck(deckId, cardId);
        await loadCards();
    };

    const handleIncrease = async (entry: LorcanaDeckCardWithCard) => {
        if (entry.quantity >= MAX_COPIES) {
            Alert.alert('Max copies', `You can only have ${MAX_COPIES} copies of the same card.`);
            return;
        }
        await setCardQuantity(deckId, entry.card_id, entry.quantity + 1);
        await loadCards();
    };

    const handleDecrease = async (entry: LorcanaDeckCardWithCard) => {
        await setCardQuantity(deckId, entry.card_id, entry.quantity - 1);
        await loadCards();
    };

    const handleRemove = (entry: LorcanaDeckCardWithCard) => {
        Alert.alert('Remove card', `Remove ${entry.card.Name} from deck?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    await removeCardFromDeck(deckId, entry.card_id);
                    await loadCards();
                },
            },
        ]);
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatsBar stats={stats} theme={theme} />

            {entries.length === 0 ? (
                <View style={styles.empty}>
                    <Icon name="cards-outline" size={56} color={theme.border} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary || theme.text }]}>
                        Tap + to add cards
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={entries}
                    keyExtractor={e => e.card_id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <DeckCardRow
                            entry={item}
                            theme={theme}
                            onIncrease={() => handleIncrease(item)}
                            onDecrease={() => handleDecrease(item)}
                            onRemove={() => handleRemove(item)}
                        />
                    )}
                />
            )}

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: theme.primary }]}
                onPress={() => setShowAddModal(true)}
            >
                <Icon name="plus" size={28} color="#fff" />
            </TouchableOpacity>

            <AddCardModal
                visible={showAddModal}
                onClose={() => setShowAddModal(false)}
                onAdd={handleAdd}
                deckInkColors={stats.inkColors}
                theme={theme}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { paddingVertical: 8, paddingBottom: 80 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyText: { fontSize: 16 },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
});

export default DeckDetailScreen;
