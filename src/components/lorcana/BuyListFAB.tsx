import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBuyList } from '../../hooks/useBuyList';
import BuyListModal from './BuyListModal';

const Icon = MaterialCommunityIcons as any;

const BuyListFAB: React.FC = () => {
    const insets = useSafeAreaInsets();
    const { count } = useBuyList();
    const [modalVisible, setModalVisible] = useState(false);

    const prevCount = useRef(count);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    // Bounce animation when count increases
    useEffect(() => {
        if (count > prevCount.current) {
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.3, useNativeDriver: true, tension: 200, friction: 5 }),
                Animated.spring(scaleAnim, { toValue: 1,   useNativeDriver: true, tension: 200, friction: 8 }),
            ]).start();
        }
        prevCount.current = count;
    }, [count, scaleAnim]);

    if (count === 0) return null;

    return (
        <>
            <Animated.View
                style={[
                    styles.fab,
                    { bottom: 16 + insets.bottom, transform: [{ scale: scaleAnim }] },
                ]}
            >
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.85}
                >
                    <Icon name="cart" size={22} color="#fff" />
                    <Text style={styles.countText}>{count}</Text>
                </TouchableOpacity>
            </Animated.View>

            <BuyListModal visible={modalVisible} onClose={() => setModalVisible(false)} />
        </>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 16,
        zIndex: 100,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: '#27AE60',
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingVertical: 13,
    },
    countText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
    },
});

export default BuyListFAB;
