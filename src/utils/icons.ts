import type { ComponentType } from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * Type-safe wrapper for MaterialCommunityIcons that avoids the need for
 * inline `as any` / `as unknown as ComponentType` casts in every file.
 */
export const Icon = MaterialCommunityIcons as unknown as ComponentType<{
    name: string;
    size: number;
    color: string;
    style?: object;
}>;
