import React, { useCallback, useState } from 'react';
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
import FastImage from '@d11/react-native-fast-image';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import {
    getWatchlist,
    upsertWatchlistEntry,
    removeFromWatchlist,
    type WatchlistEntry,
} from '../../services/WatchlistService';
import { getImageSource } from '../../utils/imageUtils';
import { inkColor } from '../../utils/formatters';
import { Icon } from '../../utils/icons';

// ── Edit targets modal ────────────────────────────────────────────────────────

const EditModal: React.FC<{
    entry: WatchlistEntry;
    visible: boolean;
    onClose: () => void;
    onSave: (buy: number | null, sell: number | null) => void;
    theme: any;
}> = ({ entry, visible, onClose, onSave, theme }) => {
    const [buyText, setBuyText] = useState(entry.target_buy?.toFixed(2) ?? '');
    const [sellText, setSellText] = useState(entry.target_sell?.toFixed(2) ?? '');

    const handleSave = () => {
        const buy = buyText.trim() ? parseFloat(buyText) : null;
        const sell = sellText.trim() ? parseFloat(sellText) : null;
        if ((buy !== null && isNaN(buy)) || (sell !== null && isNaN(sell))) return;
        onSave(buy, sell);
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                        {entry.card.Name}
                    </Text>
                    <Text style={[styles.modalSub, { color: theme.textSecondary || theme.text }]}>
                        Current: ${entry.current_usd?.toFixed(2) ?? 'N/A'}
                    </Text>

                    <Text style={[styles.inputLabel, { color: theme.text }]}>Buy below ($)</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        value={buyText}
                        onChangeText={setBuyText}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 5.00"
                        placeholderTextColor={theme.textSecondary || '#999'}
                    />

                    <Text style={[styles.inputLabel, { color: theme.text }]}>Sell above ($)</Text>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                        value={sellText}
                        onChangeText={setSellText}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 20.00"
                        placeholderTextColor={theme.textSecondary || '#999'}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={[styles.modalBtn, { borderColor: theme.border }]}
                            onPress={onClose}
                        >
                            <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
                            onPress={handleSave}
                        >
                            <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ── Watchlist row ─────────────────────────────────────────────────────────────

const WatchRow: React.FC<{
    entry: WatchlistEntry;
    onEdit: () => void;
    onRemove: () => void;
    theme: any;
}> = React.memo(({ entry, onEdit, onRemove, theme }) => {
    const price = entry.current_usd;
    const hasBuy = entry.target_buy !== null;
    const hasSell = entry.target_sell !== null;
    const dot = inkColor(entry.card.Color);

    const priceColor = entry.buy_hit ? '#28a745' : entry.sell_hit ? '#FF9800' : (theme.textSecondary || theme.text);

    return (
        <TouchableOpacity
            style={[rowStyles.container, { backgroundColor: theme.card || theme.surface, borderColor: theme.border }]}
            onPress={onEdit}
            activeOpacity={0.8}
        >
            <FastImage
                source={getImageSource(entry.card.Image) || { uri: entry.card.Image }}
                style={rowStyles.image}
                resizeMode={FastImage.resizeMode.cover}
            />

            <View style={rowStyles.info}>
                <View style={rowStyles.nameRow}>
                    <View style={[rowStyles.dot, { backgroundColor: dot }]} />
                    <Text style={[rowStyles.name, { color: theme.text }]} numberOfLines={1}>
                        {entry.card.Name}
                    </Text>
                </View>
                <Text style={[rowStyles.set, { color: theme.textSecondary || theme.text }]}>
                    {entry.card.Set_ID} · {entry.card.Rarity}
                </Text>
                <View style={rowStyles.targets}>
                    {hasBuy && (
                        <View style={[rowStyles.pill, { backgroundColor: entry.buy_hit ? '#28a74520' : `${theme.border}60` }]}>
                            <Icon name="arrow-down-circle" size={12} color={entry.buy_hit ? '#28a745' : (theme.textSecondary || '#999')} />
                            <Text style={[rowStyles.pillText, { color: entry.buy_hit ? '#28a745' : (theme.textSecondary || '#999') }]}>
                                Buy ≤${entry.target_buy!.toFixed(2)}
                            </Text>
                        </View>
                    )}
                    {hasSell && (
                        <View style={[rowStyles.pill, { backgroundColor: entry.sell_hit ? '#FF980020' : `${theme.border}60` }]}>
                            <Icon name="arrow-up-circle" size={12} color={entry.sell_hit ? '#FF9800' : (theme.textSecondary || '#999')} />
                            <Text style={[rowStyles.pillText, { color: entry.sell_hit ? '#FF9800' : (theme.textSecondary || '#999') }]}>
                                Sell ≥${entry.target_sell!.toFixed(2)}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={rowStyles.right}>
                <Text style={[rowStyles.price, { color: priceColor }]}>
                    {price !== null ? `$${price.toFixed(2)}` : 'N/A'}
                </Text>
                {(entry.buy_hit || entry.sell_hit) && (
                    <Text style={rowStyles.alert}>{entry.buy_hit ? '🟢 BUY' : '🟠 SELL'}</Text>
                )}
                <TouchableOpacity onPress={onRemove} style={rowStyles.removeBtn}>
                    <Icon name="trash-can-outline" size={18} color={theme.textSecondary || '#999'} />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
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
    image: { width: 40, height: 55 },
    info: { flex: 1, padding: 10 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    name: { flex: 1, fontSize: 13, fontWeight: '600' },
    set: { fontSize: 11, marginBottom: 6 },
    targets: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    pillText: { fontSize: 11, fontWeight: '600' },
    right: { alignItems: 'flex-end', paddingRight: 12, gap: 4, minWidth: 70 },
    price: { fontSize: 15, fontWeight: 'bold' },
    alert: { fontSize: 11, fontWeight: 'bold' },
    removeBtn: { padding: 4 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

const WatchlistScreen: React.FC = () => {
    const { theme } = useTheme();
    const [entries, setEntries] = useState<WatchlistEntry[]>([]);
    const [editing, setEditing] = useState<WatchlistEntry | null>(null);

    const load = useCallback(async () => {
        setEntries(await getWatchlist());
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const handleSave = async (buy: number | null, sell: number | null) => {
        if (!editing) return;
        await upsertWatchlistEntry(editing.card_id, buy, sell);
        setEditing(null);
        await load();
    };

    const handleRemove = (entry: WatchlistEntry) => {
        Alert.alert('Remove', `Stop watching ${entry.card.Name}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: async () => {
                await removeFromWatchlist(entry.card_id);
                await load();
            }},
        ]);
    };

    const alertCount = entries.filter(e => e.buy_hit || e.sell_hit).length;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {alertCount > 0 && (
                <View style={[styles.alertBanner, { backgroundColor: '#28a74515', borderColor: '#28a745' }]}>
                    <Icon name="bell-ring" size={18} color="#28a745" />
                    <Text style={styles.alertBannerText}>
                        {alertCount} target{alertCount > 1 ? 's' : ''} hit
                    </Text>
                </View>
            )}

            {entries.length === 0 ? (
                <View style={styles.empty}>
                    <Icon name="eye-outline" size={64} color={theme.border} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>No cards watched</Text>
                    <Text style={[styles.emptySub, { color: theme.textSecondary || theme.text }]}>
                        Open any card and tap Watch to set price targets
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={entries}
                    keyExtractor={e => e.card_id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <WatchRow
                            entry={item}
                            theme={theme}
                            onEdit={() => setEditing(item)}
                            onRemove={() => handleRemove(item)}
                        />
                    )}
                />
            )}

            {editing && (
                <EditModal
                    entry={editing}
                    visible
                    onClose={() => setEditing(null)}
                    onSave={handleSave}
                    theme={theme}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    list: { paddingVertical: 8 },
    alertBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        margin: 16,
        marginBottom: 4,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    alertBannerText: { color: '#28a745', fontWeight: '600', fontSize: 14 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold' },
    emptySub: { fontSize: 14, textAlign: 'center' },
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
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    modalSub: { fontSize: 14, marginBottom: 20 },
    inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        fontSize: 16,
        marginBottom: 16,
    },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
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

export default WatchlistScreen;
