import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    Vibration,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { Icon } from '../../utils/icons';

const WIN_LORE = 20;
const STORAGE_KEY = 'lore_tracker_state';

interface PlayerState {
    name: string;
    lore: number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// ── Animated lore counter ──────────────────────────────────────────────────────

const LoreCounter: React.FC<{
    player: PlayerState;
    flipped: boolean;
    onDelta: (delta: number) => void;
    onNamePress: () => void;
    theme: any;
    won: boolean;
}> = ({ player, flipped, onDelta, onNamePress, theme, won }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const pulse = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.25, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
    };

    const handlePlus = () => {
        if (player.lore >= WIN_LORE) return;
        pulse();
        onDelta(1);
    };

    const handleMinus = () => {
        if (player.lore <= 0) return;
        pulse();
        onDelta(-1);
    };

    const pct = player.lore / WIN_LORE;
    const barColor = won ? '#FFD700' : player.lore >= 15 ? '#FF9800' : theme.primary;

    return (
        <View style={[halfStyles.container, { transform: [{ rotate: flipped ? '180deg' : '0deg' }] }]}>
            {/* Lore progress bar */}
            <View style={[halfStyles.progressTrack, { backgroundColor: theme.border }]}>
                <Animated.View
                    style={[
                        halfStyles.progressFill,
                        { width: `${pct * 100}%`, backgroundColor: barColor },
                    ]}
                />
            </View>

            {/* Player name */}
            <TouchableOpacity onPress={onNamePress} style={halfStyles.nameRow}>
                <Text style={[halfStyles.name, { color: won ? '#FFD700' : theme.text }]}>
                    {player.name}
                </Text>
                {won && <Icon name="crown" size={18} color="#FFD700" style={{ marginLeft: 6 }} />}
            </TouchableOpacity>

            {/* Lore display */}
            <View style={halfStyles.loreRow}>
                <TouchableOpacity
                    style={[halfStyles.btn, { backgroundColor: '#dc354520' }]}
                    onPress={handleMinus}
                    activeOpacity={0.7}
                >
                    <Icon name="minus" size={28} color="#dc3545" />
                </TouchableOpacity>

                <Animated.Text
                    style={[halfStyles.loreNum, { color: won ? '#FFD700' : theme.text, transform: [{ scale: scaleAnim }] }]}
                >
                    {player.lore}
                </Animated.Text>

                <TouchableOpacity
                    style={[halfStyles.btn, { backgroundColor: '#28a74520' }]}
                    onPress={handlePlus}
                    activeOpacity={0.7}
                    disabled={player.lore >= WIN_LORE}
                >
                    <Icon name="plus" size={28} color={player.lore >= WIN_LORE ? theme.border : '#28a745'} />
                </TouchableOpacity>
            </View>

            <Text style={[halfStyles.loreLabel, { color: theme.textSecondary || theme.text }]}>
                lore
            </Text>
        </View>
    );
};

const halfStyles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
    },
    progressTrack: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 16,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    name: {
        fontSize: 18,
        fontWeight: '600',
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
    },
    loreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    btn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loreNum: {
        fontSize: 72,
        fontWeight: 'bold',
        minWidth: 100,
        textAlign: 'center',
    },
    loreLabel: {
        fontSize: 14,
        marginTop: 8,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
});

// ── Divider with reset ─────────────────────────────────────────────────────────

const Divider: React.FC<{ onReset: () => void; firstPlayer: 0 | 1 | null; onToggleFirst: () => void; theme: any }> =
    ({ onReset, firstPlayer, onToggleFirst, theme }) => (
        <View style={[divStyles.container, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
            <TouchableOpacity style={divStyles.btn} onPress={onToggleFirst}>
                <Icon name="sword-cross" size={16} color={theme.textSecondary || theme.text} />
                <Text style={[divStyles.firstText, { color: theme.textSecondary || theme.text }]}>
                    {firstPlayer === null ? 'Set first player' : `P${firstPlayer + 1} goes first`}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity style={divStyles.btn} onPress={onReset}>
                <Icon name="refresh" size={16} color={theme.textSecondary || theme.text} />
                <Text style={[divStyles.btnText, { color: theme.textSecondary || theme.text }]}>New game</Text>
            </TouchableOpacity>
        </View>
    );

const divStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    btn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
    btnText: { fontSize: 13 },
    firstText: { fontSize: 13 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

const LoreTrackerScreen: React.FC = () => {
    const { theme } = useTheme();
    const [players, setPlayers] = useState<[PlayerState, PlayerState]>([
        { name: 'Player 1', lore: 0 },
        { name: 'Player 2', lore: 0 },
    ]);
    const [firstPlayer, setFirstPlayer] = useState<0 | 1 | null>(null);
    const winAnnounced = useRef(false);

    // Persist state across sessions
    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then(saved => {
            if (saved) {
                try {
                    const { players: p, firstPlayer: fp } = JSON.parse(saved);
                    setPlayers(p);
                    setFirstPlayer(fp);
                } catch { /* ignore bad saved state */ }
            }
        });
    }, []);

    const persist = useCallback((p: [PlayerState, PlayerState], fp: 0 | 1 | null) => {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ players: p, firstPlayer: fp }));
    }, []);

    const handleDelta = (idx: 0 | 1, delta: number) => {
        setPlayers(prev => {
            const next: [PlayerState, PlayerState] = [{ ...prev[0] }, { ...prev[1] }];
            next[idx] = { ...next[idx], lore: clamp(next[idx].lore + delta, 0, WIN_LORE) };

            // Win condition
            if (next[idx].lore >= WIN_LORE && !winAnnounced.current) {
                winAnnounced.current = true;
                Vibration.vibrate([0, 200, 100, 200]);
                setTimeout(() => {
                    Alert.alert(`${next[idx].name} wins!`, `${next[idx].name} reached ${WIN_LORE} lore!`, [
                        { text: 'New Game', onPress: () => resetGame() },
                        { text: 'Keep Viewing', style: 'cancel' },
                    ]);
                }, 300);
            }

            persist(next, firstPlayer);
            return next;
        });
    };

    const handleNamePress = (idx: 0 | 1) => {
        Alert.prompt(
            'Rename player',
            '',
            (name) => {
                if (!name?.trim()) return;
                setPlayers(prev => {
                    const next: [PlayerState, PlayerState] = [{ ...prev[0] }, { ...prev[1] }];
                    next[idx] = { ...next[idx], name: name.trim() };
                    persist(next, firstPlayer);
                    return next;
                });
            },
            'plain-text',
            players[idx].name
        );
    };

    const toggleFirst = () => {
        const next = firstPlayer === null ? 0 : firstPlayer === 0 ? 1 : null;
        setFirstPlayer(next as 0 | 1 | null);
        persist(players, next as 0 | 1 | null);
    };

    const resetGame = () => {
        winAnnounced.current = false;
        const reset: [PlayerState, PlayerState] = [
            { ...players[0], lore: 0 },
            { ...players[1], lore: 0 },
        ];
        setPlayers(reset);
        persist(reset, firstPlayer);
    };

    const confirmReset = () => {
        if (players[0].lore === 0 && players[1].lore === 0) { resetGame(); return; }
        Alert.alert('New Game', 'Reset both lore counters to 0?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: resetGame },
        ]);
    };

    const winner = players[0].lore >= WIN_LORE ? 0 : players[1].lore >= WIN_LORE ? 1 : null;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Player 2 — flipped so they can read it across the table */}
            <LoreCounter
                player={players[1]}
                flipped
                onDelta={(d) => handleDelta(1, d)}
                onNamePress={() => handleNamePress(1)}
                theme={theme}
                won={winner === 1}
            />

            <Divider
                onReset={confirmReset}
                firstPlayer={firstPlayer}
                onToggleFirst={toggleFirst}
                theme={theme}
            />

            {/* Player 1 — normal orientation */}
            <LoreCounter
                player={players[0]}
                flipped={false}
                onDelta={(d) => handleDelta(0, d)}
                onNamePress={() => handleNamePress(0)}
                theme={theme}
                won={winner === 0}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
});

export default LoreTrackerScreen;
