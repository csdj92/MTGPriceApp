import { LorcanaCard as LorcanaDbCard } from '../types/lorcana';
import { LorcanaCard } from '../types/card';

/**
 * Convert Pascal-case DB Lorcana card into camel-case view-model used by UI.
 */
const parseVersion = (name: string): string => {
  const separator = ' - ';
  const separatorIndex = name.indexOf(separator);
  if (separatorIndex === -1) return '';

  const parsed = name.slice(separatorIndex + separator.length).trim();
  return parsed.toLowerCase() === 'undefined' ? '' : parsed;
};

export const mapDbToVm = (db: LorcanaDbCard): LorcanaCard => ({
  uuid: db.Unique_ID,
  name: db.Name,
  setCode: db.Set_ID ?? '',
  rarity: db.Rarity,
  imageUrl: db.Image ?? '',
  version: parseVersion(db.Name),
  isLorcana: true,
});
