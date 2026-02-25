import { SQLiteDatabase } from 'react-native-sqlite-storage';
import DatabaseInitializer from './DatabaseInitializer';

export const getLorcanaDatabase = async (): Promise<SQLiteDatabase> => {
    return DatabaseInitializer.getDatabase('lorcana');
};
