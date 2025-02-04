import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import screens
import CollectionScreen from '../screens/collection/CollectionScreen';
import SearchScreen from '../screens/search/SearchScreen';
import WatchlistScreen from '../screens/watchlist/WatchlistScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import PriceLookupScreen from '../screens/price/PriceLookupScreen';
import CollectionDetailsScreen from '../screens/collection/CollectionDetailsScreen';
import type { ExtendedCard } from '../types/card';
import SetCompletionScreen from '../screens/collection/SetCompletionScreen';
import CardDetailsScreen from '../screens/CardDetailsScreen';
import LorcanaCardDetailsScreen from '../screens/LorcanaCardDetailsScreen';
import type { LorcanaCardWithPrice } from '../types/lorcana';
import CameraTest from '../components/test';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DeckBuilder from '../components/DeckBuilder';
import ManualCaptureScreen from '../screens/ManualCaptureScreen';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion

export type RootStackParamList = {
    MainTabs: undefined;
    Collection: { collectionId: string; title: string; setCode: string } | undefined;
    CollectionDetails: { collectionId: string; title: string };
    CardDetails: { card: ExtendedCard; onClose?: () => void };
    SetCompletion: undefined;
    PriceLookup: undefined;
    LorcanaCollection: { collectionId: string; title: string; setCode: string };
    LorcanaCardDetails: {
        card: LorcanaCardWithPrice;
        collectionId: string;
    };
    CameraTest: undefined;
    DeckDetailScreen: { deckId: number };
    Watchlist: { deckId?: number };
    DeckBuilder: undefined;
};

export type MainTabParamList = {
    Collection: undefined;
    Search: undefined;
    Watchlist: undefined;
    Settings: undefined;
    PriceLookup: undefined;
    ManualCapture: undefined;
};


const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => (
    <Tab.Navigator
        screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => {
                let iconName: string;
                switch (route.name) {
                    case 'Collection':
                        iconName = 'cards';
                        break;
                    case 'Search':
                        iconName = 'card-search';
                        break;
                    case 'Watchlist':
                        iconName = 'star';
                        break;
                    case 'Settings':
                        iconName = 'cog';
                        break;
                    case 'PriceLookup':
                        iconName = 'cash-multiple';
                        break;
                    default:
                        iconName = 'help';
                        break;
                    case 'ManualCapture':
                        iconName = 'robot';
                        break;
                }
                return <Icon name={iconName} size={size} color={color} />;
            },

        })}
    >
        <Tab.Screen name="Collection" component={CollectionScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
        <Tab.Screen name="Watchlist" component={WatchlistScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
        <Tab.Screen name="PriceLookup" component={PriceLookupScreen} />
        <Tab.Screen name="ManualCapture" component={ManualCaptureScreen} />
    </Tab.Navigator>
);


const AppNavigator = () => (
    <NavigationContainer>
        <Stack.Navigator
            screenOptions={{
                headerShown: true,
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
                name="CardDetails" 
                component={CardDetailsScreen}
                options={{ title: 'Card Details' }}
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
                name="CameraTest" 
                component={CameraTest}
                options={{
                    title: 'Camera Test',
                    headerShown: false
                }}
            />
            <Stack.Screen 
                name="DeckDetailScreen" 
                component={require('../screens/decks/DeckDetailScreen').default}
                options={{ title: 'Deck Details' }}
            />
            <Stack.Screen 
                name="DeckBuilder" 
                component={DeckBuilder}
                options={{ title: 'Deck Builder' }}
            />
        </Stack.Navigator>
    </NavigationContainer>
);

export default AppNavigator; 