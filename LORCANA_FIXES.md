# Lorcana Card Import & Collection System - Fixes & Troubleshooting Guide

## Overview
This document outlines the fixes applied to resolve issues with the Lorcana card import system, duplicate card problems, and collection management functionality.

## Issues Fixed

### 1. Card Import Creates Duplicate Cards
**Problem:** The card import process created duplicate entries - one set with proper text Set_IDs ("FAB", "ARI") and another with numeric Set_IDs ("9", "7").

**Root Cause:** The import logic wasn't properly handling Set_ID format conversions, leading to both old and new format cards being stored.

**Solution:**
- Added duplicate cleanup functionality in `cleanupDuplicateCards()` function
- Added "Clean Up Duplicate Cards" button in Settings
- Keeps cards with proper text Set_ID format, removes numeric format duplicates

**Files Modified:**
- `src/services/LorcanaService.ts` - Added `cleanupDuplicateCards()` function
- `src/screens/settings/SettingsScreen.tsx` - Added cleanup UI

### 2. Set Collections Show totalCards: 0
**Problem:** Set Completion screen showed 0 cards for all sets, even though cards were imported successfully.

**Root Cause:** The `getLorcanaSetCollections` query was trying to match text Set_ID codes ("FAB") with numeric database values ("9").

**Solution:**
- Added Set_ID mapping logic to convert text codes to numeric IDs in queries
- Updated both collection stats queries and individual set card queries

**Files Modified:**
- `src/services/LorcanaService.ts` - Updated `getLorcanaSetCollections()` with mapping logic
- Added `getNumericSetId()` helper function

### 3. Set Collection Grids Show No Cards
**Problem:** When tapping on a set collection, the card grid was empty.

**Root Cause:** Same Set_ID mapping issue - `getLorcanaSetMissingCards` was looking for text codes but cards had numeric IDs.

**Solution:**
- Updated `getLorcanaSetMissingCards()` to use the Set_ID mapping
- Added the same `getNumericSetId()` helper function

**Files Modified:**
- `src/services/LorcanaService.ts` - Updated `getLorcanaSetMissingCards()`

### 4. "Add to Collection" Creates New Collections Instead of Using Existing Ones
**Problem:** Clicking "Add to Collection" on cards created new duplicate collections instead of adding to existing set collections.

**Root Cause:** The collection finding logic was using `card.Set_ID` (numeric) to match against collection descriptions containing text codes.

**Solution:**
- Changed collection lookup to use collection names instead of Set_ID matching
- Now looks for `name = "Set: Fabled"` instead of `description LIKE "%(9)%"`

**Files Modified:**
- `src/hooks/useLorcanaCollection.ts` - Updated collection finding logic

### 5. Missing Database Tables
**Problem:** Lorcana database tables weren't being created, causing import and collection failures.

**Root Cause:** The `ensureLorcanaInitialized()` function was empty, so tables were never created.

**Solution:**
- Implemented proper table creation logic in `ensureLorcanaInitialized()`
- Creates all necessary Lorcana tables: cards, collections, collection_cards, card_prices

**Files Modified:**
- `src/services/LorcanaService.ts` - Implemented `ensureLorcanaInitialized()`

## Set_ID Mapping Reference

The system uses this mapping between text codes and numeric IDs:

```javascript
const mapping = {
    'TFC': '1',   // The First Chapter
    'ROF': '2',   // Rise of the Floodborn
    'INK': '3',   // Into the Inklands
    'URS': '4',   // Ursula's Return
    'SSK': '5',   // Shimmering Skies
    'AZS': '6',   // Azurite Sea
    'ARI': '7',   // Archazia's Island
    'ROJ': '8',   // Reign of Jafar
    'FAB': '9',   // Fabled
    'WHI': '10'   // Whispers in the Well
};
```

## Database Schema

### lorcana_cards
```sql
CREATE TABLE lorcana_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Artist TEXT, Body_Text TEXT, Card_Num INTEGER, Classifications TEXT,
    Color TEXT, Cost INTEGER, Date_Added TEXT, Date_Modified TEXT,
    Flavor_Text TEXT, Franchise TEXT, Image TEXT, Inkable INTEGER,
    Lore INTEGER, Name TEXT, Rarity TEXT, Set_ID TEXT, Set_Name TEXT,
    Set_Num INTEGER, Strength INTEGER, Type TEXT, Unique_ID TEXT UNIQUE,
    Willpower INTEGER, price_usd TEXT, price_usd_foil TEXT,
    last_updated TEXT, collected INTEGER DEFAULT 0
);
```

### lorcana_collections
```sql
CREATE TABLE lorcana_collections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    total_value REAL DEFAULT 0,
    card_count INTEGER DEFAULT 0,
    set_number INTEGER
);
```

### lorcana_collection_cards
```sql
CREATE TABLE lorcana_collection_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    added_at TEXT NOT NULL,
    FOREIGN KEY (collection_id) REFERENCES lorcana_collections(id) ON DELETE CASCADE
);
```

## Common Issues & Solutions

### Issue: Set Completion Shows 0 Cards
**Symptoms:** Set collections exist but show 0 total cards
**Cause:** Set_ID mapping issue in `getLorcanaSetCollections`
**Solution:** Check that the Set_ID mapping in the query is correct

### Issue: Empty Set Grids
**Symptoms:** Tapping on set collections shows no cards
**Cause:** Set_ID mapping issue in `getLorcanaSetMissingCards`
**Solution:** Verify the `getNumericSetId` function is working correctly

### Issue: Duplicate Collections Created
**Symptoms:** "Add to Collection" creates new collections instead of using existing ones
**Cause:** Collection lookup logic using wrong Set_ID format
**Solution:** Check that collection finding uses names, not Set_ID matching

### Issue: Import Shows Duplicates
**Symptoms:** Same cards appear multiple times in different formats
**Cause:** Import process created both old and new Set_ID formats
**Solution:** Run "Clean Up Duplicate Cards" from Settings

## Testing Checklist

After any changes to the Lorcana system:

1. ✅ Import cards - no duplicates created
2. ✅ Set Completion shows correct card counts
3. ✅ Set grids display all cards from that set
4. ✅ Add to Collection uses existing set collections
5. ✅ No new duplicate collections created
6. ✅ Database tables exist and are properly structured

## Key Functions to Monitor

- `cleanupDuplicateCards()` - Removes duplicate cards
- `getLorcanaSetCollections()` - Gets set completion stats
- `getLorcanaSetMissingCards()` - Gets cards for set grids
- `useLorcanaCollection.addToCollection()` - Adds cards to collections
- `ensureLorcanaInitialized()` - Creates database tables

## Database Maintenance

### Regular Cleanup
Run "Clean Up Duplicate Cards" from Settings if duplicates appear.

### Manual Database Access
To inspect the database directly:
```bash
# Android - pull database file
adb pull /data/data/com.mtgpriceapp/databases/lorcana.db

# Open with SQLite browser or command line
sqlite3 lorcana.db
.schema
SELECT Set_ID, COUNT(*) FROM lorcana_cards GROUP BY Set_ID;
```

## Safe Import of Old JSON Exports

The import system now includes comprehensive validation and normalization to safely import old JSON exports:

### **Import Validation Features:**
- **Set_ID Normalization**: Automatically converts old numeric Set_IDs ("9") to text codes ("FAB")
- **Unique_ID Formatting**: Ensures consistent card ID formatting
- **Duplicate Prevention**: Uses `INSERT OR IGNORE` to prevent duplicate cards
- **Data Validation**: Skips cards with missing essential data (Unique_ID, Name)
- **Post-Import Cleanup**: Runs automatic cleanup after import to fix any edge cases

### **What Happens During Import:**
1. **Validation**: Each card is validated and normalized
2. **Format Conversion**: Old formats are automatically converted to current standards
3. **Duplicate Check**: Cards are only added if they don't already exist
4. **Collection Linking**: Cards are properly linked to collections
5. **Cleanup**: Automatic cleanup fixes any remaining inconsistencies

### **Safe to Import Old Files:**
✅ **Old exports with numeric Set_IDs** - Automatically converted
✅ **Mixed format exports** - Normalized during import
✅ **Duplicate cards** - Safely skipped
✅ **Invalid data** - Cleanly filtered out

## Future Considerations

- Monitor for new Set_ID formats that need mapping
- Consider migrating all cards to use text Set_IDs instead of numeric
- Add validation to prevent duplicate imports
- Implement automatic cleanup on import completion

## Files Changed

### Core Services
- `src/services/LorcanaService.ts`
- `src/services/ExportService.ts` - Added safe import validation and normalization
  - Added `cleanupDuplicateCards()`
  - Fixed `getLorcanaSetCollections()` with Set_ID mapping
  - Fixed `getLorcanaSetMissingCards()` with Set_ID mapping
  - Implemented `ensureLorcanaInitialized()`

### UI Components
- `src/screens/settings/SettingsScreen.tsx`
  - Added duplicate cleanup UI
  - Added clear all cards UI

### Hooks
- `src/hooks/useLorcanaCollection.ts`
  - Fixed collection finding logic to use names instead of Set_ID

This document should help diagnose and fix any future issues with the Lorcana card system.
