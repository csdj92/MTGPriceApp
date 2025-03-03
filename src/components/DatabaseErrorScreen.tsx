import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { databaseService } from '../services/DatabaseService';

interface DatabaseErrorScreenProps {
  error?: string;
  onRetry?: () => void;
}

const DatabaseErrorScreen: React.FC<DatabaseErrorScreenProps> = ({ 
  error = 'Database failed to initialize', 
  onRetry 
}) => {
  const handleRetry = async () => {
    if (onRetry) {
      onRetry();
    } else {
      try {
        await databaseService.initializeAllDatabases();
      } catch (err) {
        console.error('Retry failed:', err);
      }
    }
  };

  const handleDiagnose = async () => {
    try {
      const diagnostics = await databaseService.diagnoseCollectionIssues();
      console.log('Database diagnostics:', JSON.stringify(diagnostics, null, 2));
      Alert.alert('Diagnostics Complete', 'Diagnostics logged to console. Please check your development logs.');
    } catch (err) {
      console.error('Diagnostics failed:', err);
      Alert.alert('Diagnostics Failed', 'Unable to run diagnostics: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database Error</Text>
      
      <ScrollView style={styles.scrollView}>
        <Text style={styles.message}>
          The app couldn't connect to its database properly. This might be due to:
        </Text>
        
        <View style={styles.bulletPoints}>
          <Text style={styles.bulletPoint}>• Incomplete app installation</Text>
          <Text style={styles.bulletPoint}>• Insufficient storage space</Text>
          <Text style={styles.bulletPoint}>• Database corruption</Text>
          <Text style={styles.bulletPoint}>• Permission issues</Text>
        </View>
        
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error details:</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleDiagnose}>
          <Text style={styles.secondaryButtonText}>Run Diagnostics</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#dc3545'
  },
  scrollView: {
    flex: 1,
    marginBottom: 20
  },
  message: {
    fontSize: 16,
    marginBottom: 15,
    color: '#343a40',
    lineHeight: 22
  },
  bulletPoints: {
    marginBottom: 20
  },
  bulletPoint: {
    fontSize: 15,
    marginBottom: 8,
    color: '#495057',
    paddingLeft: 5
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20
  },
  errorTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#721c24'
  },
  errorText: {
    color: '#721c24',
    fontSize: 14
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  secondaryButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#6c757d'
  },
  secondaryButtonText: {
    color: '#495057',
    fontWeight: 'bold',
    fontSize: 16
  }
});

export default DatabaseErrorScreen; 