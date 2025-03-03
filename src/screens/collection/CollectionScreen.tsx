import React, { useMemo } from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaView, StyleSheet } from 'react-native';
import SetCompletionScreen from './SetCompletionScreen';
import CollectionsTab from './CollectionsTab';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import DecksScreen from '../decks/DecksScreen';
import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../context/ThemeContext';

const Tab = createMaterialTopTabNavigator();

type CollectionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Collection'>;
};

const CollectionScreen: React.FC<CollectionScreenProps> = () => {   
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <SafeAreaView style={styles.container}>
            <Tab.Navigator
                screenOptions={{
                    tabBarStyle: {
                        backgroundColor: theme.surface,
                    },
                    tabBarActiveTintColor: theme.primary,
                    tabBarInactiveTintColor: theme.textSecondary,
                    tabBarIndicatorStyle: {
                        backgroundColor: theme.primary,
                    },
                }}
            >
                <Tab.Screen 
                    name="SetCompletion" 
                    component={SetCompletionScreen}
                    options={{
                        tabBarLabel: 'Set Completion'
                    }}
                />
                <Tab.Screen 
                    name="Collections" 
                    component={CollectionsTab}
                    options={{
                        tabBarLabel: 'Collections'
                    }}
                />
                <Tab.Screen 
                    name="Decks" 
                    component={DecksScreen}
                    options={{
                        tabBarLabel: 'Decks'
                    }}
                />
            </Tab.Navigator>
        </SafeAreaView>
    );
};

// Create styles function that takes a theme and returns StyleSheet
const createStyles = (theme: Theme) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background,
    },
});

export default CollectionScreen; 