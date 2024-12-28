import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Import screens
import CollectionScreen from '../screens/collection/CollectionScreen';
import SearchScreen from '../screens/search/SearchScreen';
import WatchlistScreen from '../screens/watchlist/WatchlistScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import CardDetailsScreen from '../screens/card/CardDetailsScreen';
import PriceLookupScreen from '../screens/price/PriceLookupScreen';
import { ExtendedCard } from '../services/ScryfallService';

export type RootStackParamList = {
    MainTabs: undefined;
    CardDetails: { card: ExtendedCard };
    Collection: undefined;
    Search: undefined;
    Watchlist: undefined;
    Settings: undefined;
    PriceLookup: undefined;
};

export type MainTabParamList = {
    Collection: undefined;
    Search: undefined;
    Watchlist: undefined;
    Settings: undefined;
    PriceLookup: undefined;
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
    </Tab.Navigator>
);

const AppNavigator = () => (
    <NavigationContainer>
        <Stack.Navigator>
            <Stack.Screen
                name="MainTabs"
                component={MainTabs}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="CardDetails"
                component={CardDetailsScreen}
                options={{ title: 'Card Details' }}
            />
        </Stack.Navigator>
    </NavigationContainer>
);

export default AppNavigator; 