import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { databaseService } from '../../services/DatabaseService';
import type { Deck } from '../../services/DatabaseService';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
const Icon = MaterialCommunityIcons as any; // Temporary type assertion

const DecksScreen = () => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    try {
      console.log('Loading decks...');
      
      // Make sure the database is properly initialized before accessing it
      await databaseService.ensureInitialized();
      
      // Create decks tables if they don't exist yet
      await databaseService.createDecksTable();
      
      // Get the list of decks
      const deckList = await databaseService.getDecks();
      console.log(`Found ${deckList?.length || 0} decks`);
      
      // Update the state with the list of decks (or an empty array if null)
      setDecks(Array.isArray(deckList) ? deckList : []);
    } catch (error) {
      console.error('Error loading decks:', error);
      // Show an empty array instead of failing
      setDecks([]);
    }
  };

  const createDeck = async () => {
    if (newDeckName.trim()) {
      try {
        // Ensure database is properly initialized
        await databaseService.ensureInitialized();
        
        // Create tables if they don't exist
        await databaseService.createDecksTable();
        
        // Create the deck
        const deckId = await databaseService.createDeck(newDeckName);
        console.log(`Created deck with ID: ${deckId}`);
        
        // Update state with the new deck
        setDecks([...decks, { 
          id: deckId, 
          name: newDeckName, 
          created_at: new Date().toISOString() 
        }]);
        
        // Reset state and close modal
        setNewDeckName('');
        setIsModalVisible(false);
      } catch (error) {
        console.error('Error creating deck:', error);
        Alert.alert(
          'Error', 
          'Failed to create deck. Please try again.'
        );
      }
    } else {
      Alert.alert('Error', 'Deck name cannot be empty');
    }
  };

  const renderDeckItem = ({ item }: { item: Deck }) => (
    <TouchableOpacity
      style={styles.deckItem}
      onPress={() => navigation.navigate('DeckDetailScreen', { deckId: item.id })}
    >
      <Text style={styles.deckName}>{item.name}</Text>
      <Text style={styles.deckDate}>
        Created: {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={decks}
        renderItem={renderDeckItem}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No decks found. Create your first deck!</Text>
        }
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setIsModalVisible(true)}
      >
        <Icon name="plus" size={24} color="white" />
      </TouchableOpacity>

      <Modal visible={isModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Deck</Text>
            <TextInput
              style={styles.input}
              placeholder="Deck name"
              value={newDeckName}
              onChangeText={setNewDeckName}
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={createDeck}
              >
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  deckItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
  },
  deckName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  deckDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#2196F3',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  createButton: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    color: 'white',
    fontWeight: '500',
  },
});

export default DecksScreen; 