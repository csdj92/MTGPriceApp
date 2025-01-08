import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { SafeAreaView } from 'react-native';
import SetCompletionScreen from './SetCompletionScreen';
import CollectionsTab from './CollectionsTab';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/AppNavigator';

const Tab = createMaterialTopTabNavigator();

type CollectionScreenProps = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Collection'>;
};

const CollectionScreen: React.FC<CollectionScreenProps> = ({ navigation }) => {
    return (
        <SafeAreaView style={{ flex: 1 }}>
            <Tab.Navigator>
                <Tab.Screen 
                    name="Collections" 
                    component={CollectionsTab}
                    options={{
                        tabBarLabel: 'Collections'
                    }}
                />
                <Tab.Screen 
                    name="SetCompletion" 
                    component={SetCompletionScreen}
                    options={{
                        tabBarLabel: 'Set Completion'
                    }}
                />
            </Tab.Navigator>
        </SafeAreaView>
    );
};

export default CollectionScreen; 