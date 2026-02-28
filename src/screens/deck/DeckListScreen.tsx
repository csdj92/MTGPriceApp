import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { getAllDecks, createDeck, deleteDeck } from '../../services/DeckService';
import { getAlertCount } from '../../services/WatchlistService';
import type { LorcanaDeck } from '../../types/lorcana';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { Icon } from '../../utils/icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DeckCard: React.FC<{
    deck: LorcanaDeck;
    onPress: () => void;
    onDelete: () => void;
    theme: any;
}> = ({ deck, onPress, onDelete, theme }) => (
    <TouchableOpacity
        style={[styles.deckCard, { backgroundColor: theme.card || theme.surface, borderColor: theme.border }]}
        onPress={onPress}
        onLongPress={onDelete}
        activeOpacity={0.8}
    >
        <View style={styles.deckCardLeft}>
            <Icon name="cards-variant" size={28} color={theme.primary} />
        </View>
        <View style={styles.deckCardCenter}>
            <Text style={[styles.deckName, { color: theme.text }]} numberOfLines={1}>
                {deck.name}
            </Text>
            <Text style={[styles.deckMeta, { color: theme.textSecondary || theme.text }]}>
                {deck.card_count}/{60} cards · ${deck.total_value.toFixed(2)}
            </Text>
        </View>
        <View style={styles.deckCardRight}>
            <View style={styles.cardCountBadge}>
                <Text style={[
                    styles.cardCountText,
                    { color: deck.card_count === 60 ? '#28a745' : theme.textSecondary || theme.text }
                ]}>
                    {deck.card_count === 60 ? '✓' : `${deck.card_count}`}
                </Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.textSecondary || theme.text} />
        </View>
    </TouchableOpacity>
);

const CreateDeckModal: React.FC<{
    visible: boolean;
    onClose: () => void;
    onCreate: (name: string) => void;
    theme: any;
}> = ({ visible, onClose, onCreate, theme }) => {
    const [name, setName] = useState('');

    const handleCreate = () => {
        if (!name.trim()) return;
        onCreate(name.trim());
        setName('');
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>New Deck</Text>
                    <TextInput
                        style={[styles.modalInput, {
                            color: theme.text,
                            borderColor: theme.border,
                            backgroundColor: theme.background,
                        }]}
                        placeholder="Deck name"
                        placeholderTextColor={theme.textSecondary || '#999'}
                        value={name}
                        onChangeText={setName}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleCreate}
                    />
                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={[styles.modalBtn, { borderColor: theme.border }]}
                            onPress={onClose}
                        >
                            <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnPrimary, {
                                backgroundColor: name.trim() ? theme.primary : theme.border,
                            }]}
                            onPress={handleCreate}
                            disabled={!name.trim()}
                        >
                            <Text style={[styles.modalBtnText, { color: '#fff' }]}>Create</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const DeckListScreen: React.FC = () => {
    const { theme } = useTheme();
    const navigation = useNavigation<Nav>();
    const [decks, setDecks] = useState<LorcanaDeck[]>([]);
    const [showCreate, setShowCreate] = useState(false);
    const [watchAlerts, setWatchAlerts] = useState(0);

    const loadDecks = useCallback(async () => {
        const [result, alerts] = await Promise.all([getAllDecks(), getAlertCount()]);
        setDecks(result);
        setWatchAlerts(alerts);
    }, []);

    useFocusEffect(useCallback(() => {
        loadDecks();
    }, [loadDecks]));

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity
                    style={{ marginRight: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    onPress={() => navigation.navigate('Watchlist' as any)}
                >
                    <Icon name="eye" size={22} color={watchAlerts > 0 ? '#FF9800' : theme.text} />
                    {watchAlerts > 0 && (
                        <View style={{ backgroundColor: '#FF9800', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{watchAlerts}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            ),
        });
    }, [navigation, watchAlerts, theme.text]);

    const handleCreate = async (name: string) => {
        const deck = await createDeck(name);
        setShowCreate(false);
        // Navigate straight into the new deck
        navigation.navigate('DeckDetail' as any, { deckId: deck.id, deckName: deck.name });
    };

    const handleDelete = (deck: LorcanaDeck) => {
        Alert.alert(
            'Delete Deck',
            `Delete "${deck.name}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteDeck(deck.id);
                        setDecks(prev => prev.filter(d => d.id !== deck.id));
                    },
                },
            ]
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {decks.length === 0 ? (
                <View style={styles.empty}>
                    <Icon name="cards-variant" size={64} color={theme.border} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No decks yet</Text>
                    <Text style={[styles.emptySubtitle, { color: theme.textSecondary || theme.text }]}>
                        Tap + to build your first deck
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={decks}
                    keyExtractor={d => d.id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <DeckCard
                            deck={item}
                            theme={theme}
                            onPress={() => navigation.navigate('DeckDetail' as any, {
                                deckId: item.id,
                                deckName: item.name,
                            })}
                            onDelete={() => handleDelete(item)}
                        />
                    )}
                />
            )}

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: theme.primary }]}
                onPress={() => setShowCreate(true)}
            >
                <Icon name="plus" size={28} color="#fff" />
            </TouchableOpacity>

            <CreateDeckModal
                visible={showCreate}
                onClose={() => setShowCreate(false)}
                onCreate={handleCreate}
                theme={theme}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { padding: 16, gap: 12 },
    deckCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
    },
    deckCardLeft: { marginRight: 14 },
    deckCardCenter: { flex: 1 },
    deckCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    deckName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    deckMeta: { fontSize: 13 },
    cardCountBadge: {
        minWidth: 28,
        alignItems: 'center',
    },
    cardCountText: { fontSize: 14, fontWeight: 'bold' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
    emptySubtitle: { fontSize: 14 },
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    modalBox: {
        width: '100%',
        borderRadius: 16,
        padding: 24,
        elevation: 8,
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
    modalInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 20,
    },
    modalButtons: { flexDirection: 'row', gap: 12 },
    modalBtn: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalBtnPrimary: { borderWidth: 0 },
    modalBtnText: { fontSize: 15, fontWeight: '600' },
});

export default DeckListScreen;
