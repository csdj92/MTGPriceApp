import React, { useCallback } from 'react';
import {
    View,
    Text,
    Modal,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Alert,
    Clipboard,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useBuyList } from '../../hooks/useBuyList';
import type { BuyListItem } from '../../services/BuyListService';
import { inkColor } from '../../utils/formatters';

const Icon = MaterialCommunityIcons as any;

interface BuyListModalProps {
    visible: boolean;
    onClose: () => void;
}

const BuyListModal: React.FC<BuyListModalProps> = ({ visible, onClose }) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { items, count, total, removeCard, updateQty, clear, tcgUrl, textList } = useBuyList();

    const handleCheckout = useCallback(async () => {
        const url = tcgUrl();
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        } else {
            Alert.alert('Cannot open TCGPlayer', 'Please visit tcgplayer.com manually.');
        }
    }, [tcgUrl]);

    const handleCopyList = useCallback(() => {
        Clipboard.setString(textList());
        Alert.alert('Copied', 'Card list copied to clipboard.');
    }, [textList]);

    const handleClearAll = useCallback(() => {
        Alert.alert('Clear Cart', 'Remove all cards from your buy list?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: clear },
        ]);
    }, [clear]);

    const renderItem = useCallback(({ item }: { item: BuyListItem }) => {
        const accent = inkColor(item.color);
        const lineTotal = (item.price ?? 0) * item.quantity;

        return (
            <View style={[styles.row, { backgroundColor: theme.surface }]}>
                {/* Ink strip */}
                <View style={[styles.inkStrip, { backgroundColor: accent }]} />

                {/* Card image */}
                <View style={styles.imgWrap}>
                    {item.imageUrl ? (
                        <FastImage
                            source={{ uri: item.imageUrl }}
                            style={styles.img}
                            resizeMode={FastImage.resizeMode.cover}
                        />
                    ) : (
                        <View style={[styles.img, styles.imgPlaceholder, { backgroundColor: theme.border }]}>
                            <Icon name="cards-outline" size={22} color={theme.textSecondary} />
                        </View>
                    )}
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={2}>
                        {item.name}
                    </Text>
                    {item.setName ? (
                        <Text style={[styles.setName, { color: theme.textSecondary }]} numberOfLines={1}>
                            {item.setName}
                        </Text>
                    ) : null}

                    {/* Qty stepper */}
                    <View style={styles.qtyRow}>
                        <TouchableOpacity
                            style={[styles.qtyBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                            onPress={() => updateQty(item.id, item.quantity - 1)}
                            activeOpacity={0.7}
                        >
                            <Icon name="minus" size={14} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyNum, { color: theme.text }]}>{item.quantity}</Text>
                        <TouchableOpacity
                            style={[styles.qtyBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                            onPress={() => updateQty(item.id, item.quantity + 1)}
                            activeOpacity={0.7}
                        >
                            <Icon name="plus" size={14} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Price + remove */}
                <View style={styles.rightCol}>
                    {item.price != null && (
                        <Text style={[styles.lineTotal, { color: accent }]}>
                            ${lineTotal.toFixed(2)}
                        </Text>
                    )}
                    {item.price != null && item.quantity > 1 && (
                        <Text style={[styles.unitPrice, { color: theme.textSecondary }]}>
                            ${item.price.toFixed(2)} ea
                        </Text>
                    )}
                    <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeCard(item.id)}
                        activeOpacity={0.7}
                    >
                        <Icon name="close-circle-outline" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    }, [theme, updateQty, removeCard]);

    const emptyState = (
        <View style={styles.empty}>
            <Icon name="cart-outline" size={64} color={theme.border} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Your cart is empty</Text>
            <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                Tap the cart icon on any card to add it here
            </Text>
        </View>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            presentationStyle="pageSheet"
        >
            <View style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
                {/* ── Header ── */}
                <LinearGradient
                    colors={['#0D0D1A', '#1C1C2E']}
                    style={[styles.header, { paddingTop: 16 + insets.top }]}
                >
                    <View style={styles.headerTop}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
                            <Icon name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                        <View style={styles.headerCenter}>
                            <Icon name="cart" size={18} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.headerTitle}>BUY LIST</Text>
                            {count > 0 && (
                                <View style={styles.countBadge}>
                                    <Text style={styles.countBadgeText}>{count}</Text>
                                </View>
                            )}
                        </View>
                        <TouchableOpacity
                            onPress={handleClearAll}
                            style={styles.clearBtn}
                            activeOpacity={0.8}
                            disabled={items.length === 0}
                        >
                            <Icon
                                name="trash-can-outline"
                                size={20}
                                color={items.length > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'}
                            />
                        </TouchableOpacity>
                    </View>

                    {total > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
                            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
                        </View>
                    )}
                </LinearGradient>

                {/* ── Card list ── */}
                <FlatList
                    data={items}
                    renderItem={renderItem}
                    keyExtractor={i => i.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={emptyState}
                    ItemSeparatorComponent={() => (
                        <View style={[styles.separator, { backgroundColor: theme.border }]} />
                    )}
                />

                {/* ── Footer actions ── */}
                {items.length > 0 && (
                    <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
                        {/* Copy list */}
                        <TouchableOpacity
                            style={[styles.copyBtn, { borderColor: theme.border }]}
                            onPress={handleCopyList}
                            activeOpacity={0.8}
                        >
                            <Icon name="content-copy" size={17} color={theme.primary} />
                            <Text style={[styles.copyBtnText, { color: theme.primary }]}>Copy List</Text>
                        </TouchableOpacity>

                        {/* Checkout */}
                        <TouchableOpacity
                            style={styles.checkoutBtn}
                            onPress={handleCheckout}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['#27AE60', '#1E8449']}
                                style={styles.checkoutGradient}
                            >
                                <Icon name="open-in-new" size={17} color="#fff" />
                                <Text style={styles.checkoutBtnText}>Checkout on TCGPlayer</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container:          { flex: 1 },

    // Header
    header:             { paddingHorizontal: 16, paddingBottom: 16 },
    headerTop:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    closeBtn:           { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    clearBtn:           { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    headerCenter:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle:        { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
    countBadge:         { backgroundColor: '#6C63FF', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    countBadgeText:     { color: '#fff', fontSize: 11, fontWeight: '800' },
    totalRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
    totalLabel:         { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
    totalValue:         { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

    // List
    listContent:        { paddingVertical: 8 },
    separator:          { height: StyleSheet.hairlineWidth },

    // Row
    row:                { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 12 },
    inkStrip:           { width: 3, alignSelf: 'stretch' },
    imgWrap:            { marginHorizontal: 10 },
    img:                { width: 50, height: 70, borderRadius: 5 },
    imgPlaceholder:     { justifyContent: 'center', alignItems: 'center' },
    info:               { flex: 1, justifyContent: 'center', gap: 3 },
    cardName:           { fontSize: 13, fontWeight: '700', lineHeight: 17 },
    setName:            { fontSize: 11, fontWeight: '400' },
    qtyRow:             { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    qtyBtn:             { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    qtyNum:             { fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },

    // Right col
    rightCol:           { alignItems: 'flex-end', gap: 4, minWidth: 64 },
    lineTotal:          { fontSize: 15, fontWeight: '800', letterSpacing: -0.5 },
    unitPrice:          { fontSize: 10 },
    removeBtn:          { padding: 2 },

    // Empty
    empty:              { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
    emptyTitle:         { fontSize: 18, fontWeight: '700' },
    emptySub:           { fontSize: 13, textAlign: 'center', maxWidth: 240 },

    // Footer
    footer:             { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
    copyBtn:            { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
    copyBtnText:        { fontSize: 14, fontWeight: '600' },
    checkoutBtn:        { flex: 1, borderRadius: 12, overflow: 'hidden' },
    checkoutGradient:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    checkoutBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default BuyListModal;
