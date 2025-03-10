import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  SafeAreaView
} from 'react-native';
import { setNames } from '../../services/LorcanaService';

type SetOption = {
  label: string;
  value: string;
};

type SetSelectorProps = {
  onSetSelected: (setId: string | null) => void;
  selectedSet: string | null;
};

const SetSelector: React.FC<SetSelectorProps> = ({ onSetSelected, selectedSet }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [sets, setSets] = useState<SetOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSets();
  }, []);

  const loadSets = async () => {
    try {
      const setOptions = await setNames();
      // Add "All Sets" option at the beginning
      setSets([{ label: 'All Sets', value: '' }, ...setOptions]);
    } catch (error) {
      console.error('Error loading set names:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetSelect = (set: SetOption) => {
    onSetSelected(set.value || null);
    setIsModalVisible(false);
  };

  const getCurrentSetName = () => {
    if (!selectedSet) return 'All Sets';
    const selectedSetOption = sets.find(set => set.value === selectedSet);
    return selectedSetOption?.label || 'All Sets';
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setIsModalVisible(true)}
      >
        <Text style={styles.buttonText}>{getCurrentSetName()}</Text>
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Set</Text>
              <TouchableOpacity
                onPress={() => setIsModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={sets}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.setItem,
                    selectedSet === item.value && styles.selectedSetItem
                  ]}
                  onPress={() => handleSetSelect(item)}
                >
                  <Text style={[
                    styles.setItemText,
                    selectedSet === item.value && styles.selectedSetItemText
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 10,
    marginVertical: 5,
  },
  button: {
    backgroundColor: '#2c3e50',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
  },
  setItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedSetItem: {
    backgroundColor: '#e3f2fd',
  },
  setItemText: {
    fontSize: 16,
  },
  selectedSetItemText: {
    color: '#1976d2',
    fontWeight: 'bold',
  },
});

export default SetSelector; 