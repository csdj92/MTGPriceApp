import React, { useCallback, useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Modal,
    TextInput,
    Dimensions,
} from 'react-native';
import FastImage from "@d11/react-native-fast-image";
import LinearGradient from 'react-native-linear-gradient';
import type { LorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource, handleImageLoadError, handleImageLoadSuccess } from '../../utils/imageUtils';
import { useTheme } from '../../context/ThemeContext';
import { LorcanaPriceDetails } from './LorcanaPriceDetails';
import {
    formatLorcanaRarity,
    getLorcanaRarityColor,
    getBadgeGradientColors,
    inkColor,
} from '../../utils/formatters';
import {
    updateLorcanaCardQuantity,
    resolveMissingCardColor,
} from '../../services/LorcanaService';
import {
    getWatchlistEntry,
    upsertWatchlistEntry,
    removeFromWatchlist,
} from '../../services/WatchlistService';
import { addToBuyList, isInBuyList, subscribeBuyList, unsubscribeBuyList } from '../../services/BuyListService';
import { Icon } from '../../utils/icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_CARD_WIDTH  = SCREEN_WIDTH * 0.46;
const HERO_CARD_HEIGHT = HERO_CARD_WIDTH / 0.714;
const HERO_HEIGHT      = HERO_CARD_HEIGHT + 56; // 40px top pad (for close btn) + 16px bottom

// ─── Stat chip (used in the identity strip below the hero) ───────────────────
interface StatChipProps { icon: string; value: number | string; label: string; color: string; textColor: string; }
const StatChip: React.FC<StatChipProps> = ({ icon, value, label, color, textColor }) => (
    <View style={statStyles.chip}>
        <Icon name={icon} size={13} color={color} />
        <Text style={[statStyles.value, { color: textColor }]}>{value}</Text>
        <Text style={statStyles.label}>{label}</Text>
    </View>
);
const statStyles = StyleSheet.create({
    chip: { alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, gap: 1 },
    value: { fontSize: 15, fontWeight: '800' },
    label: { fontSize: 8, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#999' },
});

// ─── Section heading (used for scrollable sections) ──────────────────────────
interface SectionHeadProps { icon: string; title: string; accent: string; theme: ReturnType<typeof useTheme>['theme']; }
const SectionHead: React.FC<SectionHeadProps> = ({ icon, title, accent, theme }) => (
    <View style={secHeadStyles.row}>
        <Icon name={icon} size={13} color={accent} />
        <Text style={[secHeadStyles.text, { color: theme.textSecondary }]}>{title}</Text>
    </View>
);
const secHeadStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    text: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
});

// ─── Hero (full-width card image with ink gradient bg) ───────────────────────
interface ModalHeroProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
    inkAccent: string;
    handleImageLoad: () => void;
    handleImageError: () => void;
    onClose: () => void;
    onImagePress: () => void;
}
const ModalHero: React.FC<ModalHeroProps> = React.memo(({
    card, theme, inkAccent, handleImageLoad, handleImageError, onClose, onImagePress,
}) => (
    <View style={[heroStyles.container, { height: HERO_HEIGHT }]}>
        {/* Ink-tinted gradient background */}
        <LinearGradient
            colors={['#0E0E18', inkAccent + '50', '#0E0E18']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
        />
        {/* Bottom fade into the modal surface */}
        <LinearGradient
            colors={['transparent', theme.surface ?? '#fff']}
            style={heroStyles.bottomFade}
        />

        {/* Close button */}
        <TouchableOpacity style={heroStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Icon name="close" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        {/* Card image — tap to fullscreen */}
        <TouchableOpacity
            style={[heroStyles.cardShadow, { shadowColor: inkAccent }]}
            onPress={onImagePress}
            activeOpacity={0.9}
        >
            <FastImage
                source={getImageSource(card.Image) || { uri: card.Image }}
                style={heroStyles.cardImage}
                resizeMode={FastImage.resizeMode.contain}
                onLoad={handleImageLoad}
                onError={handleImageError}
            />
        </TouchableOpacity>

        {/* Zoom hint */}
        <View style={heroStyles.zoomHint} pointerEvents="none">
            <Icon name="magnify-plus-outline" size={11} color="rgba(255,255,255,0.8)" />
            <Text style={heroStyles.zoomHintText}>tap to zoom</Text>
        </View>
    </View>
));
const heroStyles = StyleSheet.create({
    container: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48 },
    closeBtn: {
        position: 'absolute', top: 12, right: 14, zIndex: 10,
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center', alignItems: 'center',
    },
    cardShadow: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.65,
        shadowRadius: 20,
        elevation: 14,
        borderRadius: 12,
    },
    cardImage: { width: HERO_CARD_WIDTH, height: HERO_CARD_HEIGHT, borderRadius: 12 },
    zoomHint: {
        position: 'absolute', bottom: 56, right: SCREEN_WIDTH / 2 - HERO_CARD_WIDTH / 2 - 4,
        backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8,
        paddingHorizontal: 7, paddingVertical: 3,
        flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    zoomHintText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },
});

// ─── Fullscreen image overlay ─────────────────────────────────────────────────
const FullscreenImage: React.FC<{ uri: string; onClose: () => void }> = ({ uri, onClose }) => (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
        <TouchableOpacity style={fsStyles.backdrop} activeOpacity={1} onPress={onClose}>
            <FastImage
                source={{ uri }}
                style={fsStyles.image}
                resizeMode={FastImage.resizeMode.contain}
            />
            <View style={fsStyles.closeHint}>
                <Icon name="close-circle" size={28} color="rgba(255,255,255,0.7)" />
            </View>
        </TouchableOpacity>
    </Modal>
);
const fsStyles = StyleSheet.create({
    backdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.96)',
        justifyContent: 'center', alignItems: 'center',
    },
    image: { width: SCREEN_WIDTH, height: SCREEN_WIDTH / 0.714 },
    closeHint: { position: 'absolute', top: 20, right: 20 },
});

// ─── QuantityControls — compact side-panel version ───────────────────────────
interface QuantityControlsProps {
    card: LorcanaCardWithPrice;
    theme: ReturnType<typeof useTheme>['theme'];
    collectionId?: string;
    onQuantityChange?: () => void;
}
const QuantityControls: React.FC<QuantityControlsProps> = React.memo(({
    card, theme, collectionId, onQuantityChange,
}) => {
    const [quantityNormal, setQuantityNormal] = useState(card.quantity_normal || 0);
    const [quantityFoil, setQuantityFoil]     = useState(card.quantity_foil || 0);
    const [updating, setUpdating]             = useState(false);

    useEffect(() => {
        setQuantityNormal(card.quantity_normal || 0);
        setQuantityFoil(card.quantity_foil || 0);
    }, [card.quantity_normal, card.quantity_foil]);

    const handleQtyChange = async (type: 'normal' | 'foil', delta: number) => {
        if (!collectionId || updating) return;
        setUpdating(true);
        try {
            const newNormal = type === 'normal' ? Math.max(0, quantityNormal + delta) : quantityNormal;
            const newFoil   = type === 'foil'   ? Math.max(0, quantityFoil   + delta) : quantityFoil;
            await updateLorcanaCardQuantity(card.Unique_ID, collectionId, newNormal, newFoil);
            setQuantityNormal(newNormal);
            setQuantityFoil(newFoil);
            if (onQuantityChange) await onQuantityChange();
        } catch (error) {
            console.error('Error updating quantity:', error);
        } finally {
            setUpdating(false);
        }
    };

    if (!card.collected || !collectionId) return null;

    const normalPrice = parseFloat(card.price_usd || card.prices?.usd || '0');
    const foilPrice   = parseFloat(card.price_usd_foil || card.prices?.usd_foil || '0');
    const totalValue  = normalPrice * quantityNormal + foilPrice * quantityFoil;
    const accent      = theme.success || '#27AE60';

    const QtyRow = ({ type, icon, qty }: { type: 'normal' | 'foil'; icon: string; qty: number }) => (
        <View style={qtyStyles.row}>
            <Icon name={icon} size={13} color={theme.textSecondary} />
            <TouchableOpacity
                style={[qtyStyles.btn, { backgroundColor: theme.error || '#dc3545', opacity: qty === 0 || updating ? 0.4 : 1 }]}
                onPress={() => handleQtyChange(type, -1)}
                disabled={qty === 0 || updating}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                <Icon name="minus" size={11} color="#fff" />
            </TouchableOpacity>
            <Text style={[qtyStyles.count, { color: theme.text }]}>{qty}</Text>
            <TouchableOpacity
                style={[qtyStyles.btn, { backgroundColor: accent, opacity: updating ? 0.4 : 1 }]}
                onPress={() => handleQtyChange(type, 1)}
                disabled={updating}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                <Icon name="plus" size={11} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={qtyStyles.card}>
            {/* Header row: label + live total */}
            <View style={qtyStyles.headerRow}>
                <Text style={[qtyStyles.header, { color: theme.textSecondary }]}>QTY</Text>
                {totalValue > 0 && (
                    <Text style={[qtyStyles.inlineValue, { color: accent }]}>${totalValue.toFixed(2)}</Text>
                )}
            </View>
            <QtyRow type="normal" icon="cards"         qty={quantityNormal} />
            <QtyRow type="foil"   icon="cards-diamond" qty={quantityFoil}   />
        </View>
    );
});
const qtyStyles = StyleSheet.create({
    card: {
        borderRadius: 12,
        backgroundColor: 'rgba(128,128,128,0.1)',
        paddingHorizontal: 10, paddingVertical: 8, gap: 5, width: 140,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 },
    header: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, alignSelf: 'center' },
    inlineValue: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    btn: { width: 24, height: 24, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
    count: { fontSize: 15, fontWeight: '800', minWidth: 24, textAlign: 'center' },
});

// ─── WatchButton (unchanged) ─────────────────────────────────────────────────
const WatchButton: React.FC<{ cardId: string; theme: any }> = ({ cardId, theme }) => {
    const [watched, setWatched]     = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [buyText, setBuyText]     = useState('');
    const [sellText, setSellText]   = useState('');

    useEffect(() => {
        let active = true;
        getWatchlistEntry(cardId).then(entry => {
            if (!active) return;
            setWatched(!!entry);
            setBuyText(entry?.target_buy?.toFixed(2) ?? '');
            setSellText(entry?.target_sell?.toFixed(2) ?? '');
        });
        return () => { active = false; };
    }, [cardId]);

    const handleSave = async () => {
        const buy  = buyText.trim()  ? parseFloat(buyText)  : null;
        const sell = sellText.trim() ? parseFloat(sellText) : null;
        await upsertWatchlistEntry(cardId, buy, sell);
        setWatched(true);
        setShowModal(false);
    };

    const handleRemove = async () => {
        await removeFromWatchlist(cardId);
        setWatched(false);
        setBuyText('');
        setSellText('');
        setShowModal(false);
    };

    return (
        <>
            <TouchableOpacity
                style={[watchStyles.btn, { borderColor: watched ? '#FF9800' : theme.border }]}
                onPress={() => setShowModal(true)}
            >
                <Icon name={watched ? 'eye' : 'eye-outline'} size={16} color={watched ? '#FF9800' : (theme.textSecondary || theme.text)} />
                <Text style={[watchStyles.btnText, { color: watched ? '#FF9800' : (theme.textSecondary || theme.text) }]}>
                    {watched ? 'Watching' : 'Watch price'}
                </Text>
            </TouchableOpacity>

            <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
                <View style={watchStyles.overlay}>
                    <View style={[watchStyles.box, { backgroundColor: theme.surface }]}>
                        <Text style={[watchStyles.title, { color: theme.text }]}>Set price targets</Text>
                        <Text style={[watchStyles.label, { color: theme.text }]}>Buy below ($)</Text>
                        <TextInput
                            style={[watchStyles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                            value={buyText} onChangeText={setBuyText}
                            keyboardType="decimal-pad" placeholder="e.g. 5.00"
                            placeholderTextColor={theme.textSecondary || '#999'}
                        />
                        <Text style={[watchStyles.label, { color: theme.text }]}>Sell above ($)</Text>
                        <TextInput
                            style={[watchStyles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                            value={sellText} onChangeText={setSellText}
                            keyboardType="decimal-pad" placeholder="e.g. 20.00"
                            placeholderTextColor={theme.textSecondary || '#999'}
                        />
                        <View style={watchStyles.row}>
                            {watched && (
                                <TouchableOpacity style={[watchStyles.actBtn, { backgroundColor: '#dc354520' }]} onPress={handleRemove}>
                                    <Text style={{ color: '#dc3545', fontWeight: '600' }}>Remove</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={[watchStyles.actBtn, { borderColor: theme.border, borderWidth: 1 }]} onPress={() => setShowModal(false)}>
                                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[watchStyles.actBtn, { backgroundColor: theme.primary }]} onPress={handleSave}>
                                <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};
const watchStyles = StyleSheet.create({
    btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, alignSelf: 'center', marginBottom: 4 },
    btnText: { fontSize: 13, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
    box: { width: '100%', borderRadius: 16, padding: 24, elevation: 8 },
    title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 16 },
    row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
    actBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});

// ─── Main modal ───────────────────────────────────────────────────────────────
interface LorcanaCardModalProps {
    card: LorcanaCardWithPrice | null;
    visible: boolean;
    onClose: () => void;
    onDelete: () => void;
    onAddToCollection?: () => void;
    onRemoveFromCollection?: () => void;
    addLabel?: string;
    priceData?: any;
    isPriceLoading?: boolean;
    collectionId?: string;
    onQuantityChange?: () => void;
}

const LorcanaCardModal: React.FC<LorcanaCardModalProps> = React.memo(({
    card, visible, onClose, onDelete,
    onAddToCollection, onRemoveFromCollection, addLabel,
    priceData, isPriceLoading, collectionId, onQuantityChange,
}) => {
    const { theme } = useTheme();
    const [resolvedColor, setResolvedColor] = useState<string | null>(null);
    const [inBuyList, setInBuyList] = useState(false);
    const [showFullscreen, setShowFullscreen] = useState(false);

    const handleImageLoad = useCallback(() => {
        if (!card) return;
        handleImageLoadSuccess(card.Image, { name: card.Name, id: card.Unique_ID, context: 'modal' });
    }, [card?.Image, card?.Name, card?.Unique_ID]);

    const handleImageError = useCallback(() => {
        if (!card) return;
        handleImageLoadError(card.Image, card.Name);
    }, [card?.Image, card?.Name]);

    // Resolve missing ink color from API
    useEffect(() => {
        if (!card) return;
        let isActive = true;
        const currentColor = typeof card.Color === 'string' ? card.Color.trim() : '';
        if (currentColor.length > 0) {
            setResolvedColor(currentColor);
            return () => { isActive = false; };
        }
        setResolvedColor(null);
        resolveMissingCardColor({
            Unique_ID: card.Unique_ID, Set_ID: card.Set_ID,
            Set_Num: card.Set_Num, Card_Num: card.Card_Num, Color: card.Color,
        }).then(color => {
            if (!isActive || !color) return;
            console.log('[LorcanaCardModal] Resolved missing card color from API:', { uniqueId: card.Unique_ID, name: card.Name, color });
            setResolvedColor(color);
        }).catch(error => {
            console.log('[LorcanaCardModal] Failed to resolve missing card color:', error);
        });
        return () => { isActive = false; };
    }, [card?.Unique_ID, card?.Set_ID, card?.Set_Num, card?.Card_Num, card?.Color, card?.Name]);

    useEffect(() => {
        if (!visible || !card) return;
        console.log('[LorcanaCardModal] Received card for render:', {
            uniqueId: card.Unique_ID, name: card.Name, setId: card.Set_ID,
            setName: card.Set_Name, setNum: card.Set_Num, cardNum: card.Card_Num,
            color: card.Color, rarity: card.Rarity, type: card.Type,
            image: card.Image, collected: card.collected,
            quantityNormal: card.quantity_normal, quantityFoil: card.quantity_foil,
            hasBodyText: Boolean(card.Body_Text), hasFlavorText: Boolean(card.Flavor_Text),
        });
    }, [visible, card?.Unique_ID, card?.Name, card?.Set_ID, card?.Set_Name, card?.Set_Num,
        card?.Card_Num, card?.Color, card?.Rarity, card?.Type, card?.Image, card?.collected,
        card?.quantity_normal, card?.quantity_foil, card?.Body_Text, card?.Flavor_Text]);

    // Sync buy list state
    useEffect(() => {
        if (!card) return;
        const sync = () => setInBuyList(isInBuyList(card.Unique_ID));
        sync();
        subscribeBuyList(sync);
        return () => unsubscribeBuyList(sync);
    }, [card?.Unique_ID]);

    if (!card) return null;

    const displayCard = resolvedColor ? { ...card, Color: resolvedColor } : card;

    // Pricing
    const price      = priceData?.usd      ?? card.price_usd      ?? card.prices?.usd;
    const foilPrice  = priceData?.usd_foil ?? card.price_usd_foil ?? card.prices?.usd_foil;
    const lastUpdated = priceData?.last_updated ?? card.last_updated;

    // Visual accents from ink color
    const inkAccent   = inkColor(displayCard.Color);
    const inkGradient = getBadgeGradientColors(displayCard.Color);
    const rarityColor = getLorcanaRarityColor(displayCard.Rarity, inkAccent);

    const hasBadgeGradient = inkGradient.length >= 2;

    return (
        <>
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            {/* Dim overlay */}
            <View style={styles.overlay}>
                {/* Bottom-sheet panel */}
                <View style={[styles.panel, { backgroundColor: theme.surface }]}>

                    {/* ── Hero ── */}
                    <ModalHero
                        card={displayCard}
                        theme={theme}
                        inkAccent={inkAccent}
                        handleImageLoad={handleImageLoad}
                        handleImageError={handleImageError}
                        onClose={onClose}
                        onImagePress={() => setShowFullscreen(true)}
                    />

                    {/* ── Identity strip (name + badges + stats  |  qty controls) ── */}
                    <View style={[styles.identitySection, { backgroundColor: theme.surface }]}>
                        <View style={styles.identityRow}>
                            {/* ── Left: name, badges, stat chips ── */}
                            <View style={styles.identityLeft}>
                                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                                    {displayCard.Name}
                                </Text>

                                {/* Ink + rarity badges */}
                                <View style={styles.badgesRow}>
                                    {displayCard.Color ? (
                                        hasBadgeGradient ? (
                                            <LinearGradient
                                                colors={[inkGradient[0], inkGradient[1]]}
                                                start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                                                style={styles.badge}
                                            >
                                                <Text style={styles.badgeText}>{displayCard.Color}</Text>
                                            </LinearGradient>
                                        ) : (
                                            <View style={[styles.badge, { backgroundColor: inkAccent }]}>
                                                <Text style={styles.badgeText}>{displayCard.Color}</Text>
                                            </View>
                                        )
                                    ) : null}
                                    {displayCard.Rarity ? (
                                        <View style={[styles.badge, { backgroundColor: rarityColor }]}>
                                            <Text style={styles.badgeText}>{formatLorcanaRarity(displayCard.Rarity)}</Text>
                                        </View>
                                    ) : null}
                                    {displayCard.Type ? (
                                        <View style={[styles.badge, { backgroundColor: theme.border }]}>
                                            <Text style={[styles.badgeText, { color: theme.text }]}>{displayCard.Type}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* Stat chips */}
                                <View style={styles.statsRow}>
                                    {displayCard.Cost !== undefined && (
                                        <StatChip icon="circle-multiple" value={displayCard.Cost} label="Cost" color={inkAccent} textColor={theme.text} />
                                    )}
                                    {displayCard.Strength !== undefined && (
                                        <StatChip icon="sword" value={displayCard.Strength} label="STR" color="#FF7675" textColor={theme.text} />
                                    )}
                                    {displayCard.Willpower !== undefined && (
                                        <StatChip icon="shield" value={displayCard.Willpower} label="WIL" color="#74B9FF" textColor={theme.text} />
                                    )}
                                    {displayCard.Lore !== undefined && (
                                        <StatChip icon="book-open-variant" value={displayCard.Lore} label="Lore" color="#FDCB6E" textColor={theme.text} />
                                    )}
                                </View>
                            </View>

                            {/* ── Right: compact quantity controls (collected cards only) ── */}
                            <QuantityControls
                                card={card}
                                theme={theme}
                                collectionId={collectionId}
                                onQuantityChange={onQuantityChange}
                            />
                        </View>
                    </View>

                    {/* ── Scrollable content ── */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Card details */}
                        <View style={[styles.section, { borderTopColor: theme.border }]}>
                            <SectionHead icon="card-text-outline" title="Card Details" accent={inkAccent} theme={theme} />
                            {[
                                { label: 'Set',         value: `${displayCard.Set_Name ?? ''}${displayCard.Set_ID ? ` · ${displayCard.Set_ID}` : ''}` },
                                { label: 'Card #',      value: String(displayCard.Card_Num ?? '—') },
                                { label: 'Franchise',   value: displayCard.Franchise ?? '—' },
                                displayCard.Classifications
                                    ? { label: 'Class', value: displayCard.Classifications }
                                    : null,
                                displayCard.Inkable !== undefined
                                    ? { label: 'Inkable', value: displayCard.Inkable ? 'Yes' : 'No' }
                                    : null,
                            ].filter(Boolean).map((row: any) => (
                                <View key={row.label} style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                                    <Text style={[styles.detailValue, { color: theme.text }]}>{row.value}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Body text */}
                        {displayCard.Body_Text ? (
                            <View style={[styles.section, { borderTopColor: theme.border }]}>
                                <SectionHead icon="text-box-outline" title="Card Text" accent={inkAccent} theme={theme} />
                                <Text style={[styles.bodyText, { color: theme.text }]}>{displayCard.Body_Text}</Text>
                            </View>
                        ) : null}

                        {/* Flavor text */}
                        {displayCard.Flavor_Text ? (
                            <View style={[styles.section, { borderTopColor: theme.border }]}>
                                <SectionHead icon="format-quote-open" title="Flavor Text" accent={inkAccent} theme={theme} />
                                <Text style={[styles.flavorText, { color: theme.textSecondary }]}>"{displayCard.Flavor_Text}"</Text>
                            </View>
                        ) : null}

                        {/* Price section */}
                        <View style={[styles.section, { borderTopColor: theme.border }]}>
                            <SectionHead icon="tag-outline" title="Price" accent={inkAccent} theme={theme} />

                            {isPriceLoading ? (
                                <Text style={[styles.detailValue, { color: theme.textSecondary }]}>Loading prices…</Text>
                            ) : (
                                <>
                                    <View style={styles.priceCards}>
                                        <View style={[styles.priceCard, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.priceCardLabel, { color: theme.textSecondary }]}>Regular</Text>
                                            <Text style={[styles.priceCardValue, { color: inkAccent }]}>
                                                ${price ? parseFloat(price).toFixed(2) : '0.00'}
                                            </Text>
                                        </View>
                                        <View style={[styles.priceCard, { backgroundColor: theme.background }]}>
                                            <Text style={[styles.priceCardLabel, { color: theme.textSecondary }]}>Foil</Text>
                                            <Text style={[styles.priceCardValue, { color: inkAccent }]}>
                                                ${foilPrice ? parseFloat(foilPrice).toFixed(2) : '0.00'}
                                            </Text>
                                        </View>
                                    </View>
                                    {lastUpdated && (
                                        <Text style={[styles.priceUpdated, { color: theme.textSecondary }]}>
                                            Updated {new Date(lastUpdated).toLocaleDateString()}
                                        </Text>
                                    )}
                                </>
                            )}

                            {/* Price history chart */}
                            {card.Unique_ID ? (
                                <View key={`price-history-${card.Unique_ID}`} style={styles.priceHistoryContainer}>
                                    <LorcanaPriceDetails
                                        cardId={card.Unique_ID}
                                        cardName={card.Name}
                                        currentPrice={price}
                                        currentFoilPrice={foilPrice}
                                    />
                                </View>
                            ) : null}
                        </View>

                        {/* Watch button */}
                        <View style={styles.watchContainer}>
                            <WatchButton cardId={card.Unique_ID} theme={theme} />
                        </View>
                    </ScrollView>

                    {/* ── Fixed action buttons ── */}
                    <View style={[styles.actionBar, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
                        {/* Buy List — always visible, left side */}
                        <TouchableOpacity
                            style={[
                                styles.buyListBtn,
                                inBuyList
                                    ? { backgroundColor: '#E67E22' }
                                    : { borderColor: '#E67E22', borderWidth: 1.5 },
                            ]}
                            onPress={() => {
                                if (inBuyList) return;
                                const usdPrice = priceData?.usd ?? card.price_usd ?? card.prices?.usd;
                                addToBuyList({
                                    id: card.Unique_ID,
                                    name: card.Name,
                                    setName: card.Set_Name,
                                    color: displayCard.Color,
                                    price: usdPrice ? parseFloat(usdPrice) : undefined,
                                    imageUrl: card.Image,
                                    tcgplayerId: priceData?.tcgplayer_id ?? card.prices?.tcgplayer_id,
                                });
                            }}
                            activeOpacity={0.85}
                        >
                            <Icon name={inBuyList ? 'cart-check' : 'cart-plus'} size={16} color={inBuyList ? '#fff' : '#E67E22'} />
                            <Text style={[styles.buyListBtnText, { color: inBuyList ? '#fff' : '#E67E22' }]}>
                                {inBuyList ? 'In Buy List' : 'Buy List'}
                            </Text>
                        </TouchableOpacity>

                        {/* Collection action — right side */}
                        {!card.collected && onAddToCollection && (
                            <TouchableOpacity
                                style={[styles.addBtn, { backgroundColor: inkAccent }]}
                                onPress={onAddToCollection}
                                activeOpacity={0.85}
                            >
                                <Icon name="plus-circle" size={16} color="#fff" />
                                <Text style={styles.addBtnText}>{addLabel || 'Add to Collection'}</Text>
                            </TouchableOpacity>
                        )}
                        {card.collected && onRemoveFromCollection && (
                            <TouchableOpacity
                                style={[styles.removeBtn, { borderColor: theme.error || '#E74C3C' }]}
                                onPress={onRemoveFromCollection}
                                activeOpacity={0.85}
                            >
                                <Icon name="minus-circle" size={16} color={theme.error || '#E74C3C'} />
                                <Text style={[styles.removeBtnText, { color: theme.error || '#E74C3C' }]}>
                                    Remove
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>

        {showFullscreen && card.Image && (
            <FullscreenImage uri={card.Image} onClose={() => setShowFullscreen(false)} />
        )}
        </>
    );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Modal shell
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    panel: { height: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },

    // Identity strip
    identitySection: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
    identityRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    identityLeft: { flex: 1 },
    cardTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: 0.2 },
    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
    badgeText: { color: '#fff', fontWeight: '700', fontSize: 11, letterSpacing: 0.3 },
    statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

    // Scroll container
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 24 },

    // Generic section
    section: { paddingHorizontal: 18, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },

    // Detail rows
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 },
    detailLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
    detailValue: { fontSize: 14, flex: 2, textAlign: 'right' },

    // Text sections
    bodyText: { fontSize: 15, lineHeight: 23 },
    flavorText: { fontSize: 14, fontStyle: 'italic', lineHeight: 22 },

    // Price cards
    priceCards: { flexDirection: 'row', gap: 10, marginBottom: 6 },
    priceCard: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    priceCardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    priceCardValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    priceUpdated: { fontSize: 11, textAlign: 'right', marginTop: 2 },
    priceHistoryContainer: { marginTop: 14 },

    // Watch button wrapper
    watchContainer: { paddingHorizontal: 18, paddingTop: 8 },

    // Action bar — row layout so buttons sit side by side
    actionBar: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 16, paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    buyListBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 12, borderRadius: 12,
    },
    buyListBtnText: { fontSize: 14, fontWeight: '700' },
    addBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 12, borderRadius: 12,
    },
    addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    removeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
    },
    removeBtnText: { fontSize: 14, fontWeight: '600' },

});

export default LorcanaCardModal;
