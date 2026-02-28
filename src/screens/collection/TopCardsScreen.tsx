import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../context/ThemeContext';
import { getTopExpensiveOwnedCards } from '../../services/LorcanaService';
import type { PartialLorcanaCardWithPrice } from '../../types/lorcana';
import { getImageSource } from '../../utils/imageUtils';

const INK_COLOR_MAP: Record<string, string> = {
    amber: '#FFA500',
    amethyst: '#9966CC',
    emerald: '#50C878',
    ruby: '#E0115F',
    sapphire: '#0F52BA',
    steel: '#71797E',
};

const inkColor = (color: string | undefined): string =>
    INK_COLOR_MAP[(color ?? '').toLowerCase().split(/[/,|& ]+/)[0]?.trim()] ?? '#999';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

const TopCardsScreen: React.FC = () => {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [cards, setCards] = useState<PartialLorcanaCardWithPrice[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            setLoading(true);
            getTopExpensiveOwnedCards(10).then(data => {
                if (active) {
                    setCards(data);
                    setLoading(false);
                }
            });
            return () => { active = false; };
        }, [])
    );

    const getPrice = (card: PartialLorcanaCardWithPrice): number => {
        const usd = card.prices?.usd ?? card.price_usd;
        const usdFoil = card.prices?.usd_foil ?? card.price_usd_foil;
        return parseFloat((usd ?? usdFoil ?? '0') as string) || 0;
    };

    const renderItem = ({ item, index }: { item: PartialLorcanaCardWithPrice; index: number }) => {
        const price = getPrice(item);
        const rankColor = RANK_COLORS[index] ?? theme.textSecondary;
        const imageSource = getImageSource(item.Image ?? item.image);

        return (
            <View style={styles.row}>
                <Text style={[styles.rank, { color: rankColor }]}>#{index + 1}</Text>
                {imageSource ? (
                    <FastImage
                        source={imageSource}
                        style={styles.thumbnail}
                        resizeMode={FastImage.resizeMode.cover}
                    />
                ) : (
                    <View style={[styles.thumbnail, styles.noImage]} />
                )}
                <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                        {item.Name ?? item.name ?? 'Unknown'}
                    </Text>
                    <Text style={styles.set} numberOfLines={1}>
                        {item.Set_Name ?? item.set_name ?? ''}
                    </Text>
                    <View style={styles.meta}>
                        <View style={[styles.colorDot, { backgroundColor: inkColor(item.Color) }]} />
                        <Text style={styles.rarity}>{item.Rarity ?? item.rarity ?? ''}</Text>
                        {(item.quantity_normal ?? 0) + (item.quantity_foil ?? 0) > 1 && (
                            <Text style={styles.qty}>
                                ×{(item.quantity_normal ?? 0) + (item.quantity_foil ?? 0)}
                            </Text>
                        )}
                    </View>
                </View>
                <Text style={styles.price}>${price.toFixed(2)}</Text>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    if (cards.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.emptyText}>No cards in your collection yet.</Text>
                <Text style={styles.emptySubtext}>Add cards to see your most valuable ones here.</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={cards}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
                <Text style={styles.header}>Top 10 Most Valuable Cards</Text>
            }
        />
    );
};

const createStyles = (theme: Theme) =>
    StyleSheet.create({
        list: {
            padding: 12,
            backgroundColor: theme.background,
        },
        header: {
            fontSize: 16,
            fontWeight: '700',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 12,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.surface,
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
            elevation: 2,
            shadowColor: theme.border,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.12,
            shadowRadius: 3,
        },
        rank: {
            width: 32,
            fontSize: 15,
            fontWeight: '800',
            textAlign: 'center',
        },
        thumbnail: {
            width: 44,
            height: 60,
            borderRadius: 4,
            marginHorizontal: 10,
            backgroundColor: theme.background,
        },
        noImage: {
            opacity: 0.3,
        },
        info: {
            flex: 1,
            marginRight: 8,
        },
        name: {
            fontSize: 15,
            fontWeight: '600',
            color: theme.text,
        },
        set: {
            fontSize: 12,
            color: theme.textSecondary,
            marginTop: 2,
        },
        meta: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
        },
        colorDot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            marginRight: 5,
        },
        rarity: {
            fontSize: 12,
            color: theme.textSecondary,
        },
        qty: {
            fontSize: 12,
            color: theme.textSecondary,
            marginLeft: 8,
        },
        price: {
            fontSize: 18,
            fontWeight: '700',
            color: theme.primary,
            minWidth: 64,
            textAlign: 'right',
        },
        center: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.background,
            padding: 24,
        },
        emptyText: {
            fontSize: 18,
            fontWeight: '600',
            color: theme.text,
            marginBottom: 8,
        },
        emptySubtext: {
            fontSize: 14,
            color: theme.textSecondary,
            textAlign: 'center',
        },
    });

export default TopCardsScreen;
