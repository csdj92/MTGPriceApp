import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import useThemedStyles from '../../hooks/useThemedStyles';
import type { Theme } from '../../context/ThemeContext';

const Icon = MaterialCommunityIcons as unknown as React.ComponentType<{
    name: string;
    size: number;
    color: string;
}>;

interface SelectionHeaderProps {
    selectedCount: number;
    onBulkAdd: () => void;
    onBulkDelete: () => void;
    onCancel: () => void;
    onBulkBuyList?: () => void;
}

const SelectionHeader: React.FC<SelectionHeaderProps> = ({
    selectedCount,
    onBulkAdd,
    onBulkDelete,
    onCancel,
    onBulkBuyList,
}) => {
    const { theme } = useTheme();
    const styles = useStyles();

    return (
        <View style={[styles.selectionHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.selectionCount, { color: theme.text }]}>
                {selectedCount} selected
            </Text>
            <View style={styles.selectionActions}>
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.primary }]}
                    onPress={onBulkAdd}
                >
                    <Icon name="plus" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Add to Collection</Text>
                </TouchableOpacity>
                {onBulkBuyList && (
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#E67E22' }]}
                        onPress={onBulkBuyList}
                    >
                        <Icon name="cart-plus" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Buy List</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.error }]}
                    onPress={onBulkDelete}
                >
                    <Icon name="delete" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.border }]}
                    onPress={onCancel}
                >
                    <Icon name="close" size={20} color={theme.text} />
                    <Text style={[styles.actionButtonText, { color: theme.text }]}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const useStyles = () => useThemedStyles((theme: Theme) => ({
    selectionHeader: {
        padding: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    selectionCount: {
        fontSize: 16,
        fontWeight: '600' as '600',
    },
    selectionActions: {
        flexDirection: 'row' as 'row',
        gap: 8,
        flexWrap: 'wrap' as 'wrap',
    },
    actionButton: {
        flexDirection: 'row' as 'row',
        alignItems: 'center' as 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600' as '600',
    },
}));

export default SelectionHeader;
