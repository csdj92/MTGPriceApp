import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';

// Import screens
import CollectionScreen from '../screens/collection/CollectionScreen';
import SearchScreen from '../screens/search/SearchScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import PriceLookupScreen from '../screens/price/PriceLookupScreen.refactored';
import CollectionDetailsScreen from '../screens/collection/CollectionDetailsScreen';
import SetCompletionScreen from '../screens/collection/SetCompletionScreen';
import LorcanaCardDetailsScreen from '../screens/LorcanaCardDetailsScreen';
import DeckListScreen from '../screens/deck/DeckListScreen';
import DeckDetailScreen from '../screens/deck/DeckDetailScreen';
import WatchlistScreen from '../screens/watchlist/WatchlistScreen';
import LoreTrackerScreen from '../screens/game/LoreTrackerScreen';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion
import type { PartialLorcanaCardWithPrice } from '../types/lorcana';

export type RootStackParamList = {
    MainTabs: undefined;
    Collection: { collectionId: string; title: string; setCode: string } | undefined;
    CollectionDetails: { collectionId: string; title: string };
    SetCompletion: undefined;
    PriceLookup: undefined;
    LorcanaCollection: { collectionId: string; title: string; setCode: string };
    LorcanaCardDetails: {
        card: PartialLorcanaCardWithPrice;
        collectionId: string;
    };
    DeckDetail: { deckId: string; deckName: string };
    Watchlist: undefined;
};

export type MainTabParamList = {
    Collection: undefined;
    Search: undefined;
    Decks: undefined;
    Game: undefined;
    Settings: undefined;
    PriceLookup: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const getTabIconName = (routeName: string): string => {
    const icons: Record<string, string> = {
        Collection: 'cards',
        Search: 'card-search',
        Decks: 'cards-variant',
        Game: 'sword-cross',
        Settings: 'cog',
        PriceLookup: 'cash-multiple',
    };
    return icons[routeName] || 'help';
};

const MainTabs = () => {
    const { theme } = useTheme();
    
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => (
                    <Icon name={getTabIconName(route.name)} size={size} color={color} />
                ),
                tabBarActiveTintColor: theme.tabBarActive,
                tabBarInactiveTintColor: theme.tabBarInactive,
                tabBarStyle: {
                    backgroundColor: theme.tabBar,
                    borderTopColor: theme.border,
                },
                headerStyle: {
                    backgroundColor: theme.surface,
                },
                headerTintColor: theme.text,
                tabBarLabelStyle: {
                    fontSize: 12,
                },
            })}
        >
            <Tab.Screen name="Collection" component={CollectionScreen} />
            <Tab.Screen name="Search" component={SearchScreen} />
            <Tab.Screen name="Decks" component={DeckListScreen} />
            <Tab.Screen name="Game" component={LoreTrackerScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
            <Tab.Screen name="PriceLookup" component={PriceLookupScreen} />
        </Tab.Navigator>
    );
};

const AppNavigator = () => {
    const { theme } = useTheme();
    
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: true,
                headerStyle: {
                    backgroundColor: theme.surface,
                },
                headerTintColor: theme.text,
                contentStyle: {
                    backgroundColor: theme.background,
                },
            }}
        >
            <Stack.Screen 
                name="MainTabs" 
                component={MainTabs}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="CollectionDetails"
                component={CollectionDetailsScreen}
                options={({ route }) => ({
                    title: route.params.title || 'Collection Details'
                })}
            />
            <Stack.Screen
                name="SetCompletion"
                component={SetCompletionScreen}
                options={{ title: 'Set Completion' }}
            />
            <Stack.Screen
                name="LorcanaCardDetails"
                component={LorcanaCardDetailsScreen}
                options={{ title: 'Lorcana Card Details' }}
            />
            <Stack.Screen
                name="DeckDetail"
                component={DeckDetailScreen}
                options={({ route }) => ({ title: (route.params as any).deckName })}
            />
            <Stack.Screen
                name="Watchlist"
                component={WatchlistScreen}
                options={{ title: 'Price Watchlist' }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;