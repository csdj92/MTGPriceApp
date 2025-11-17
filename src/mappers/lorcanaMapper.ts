import { LorcanaCard as LorcanaDbCard } from '../types/lorcana';
import { LorcanaCard } from '../types/card';

/**
 * Convert Pascal-case DB Lorcana card into camel-case view-model used by UI.
 */
export const mapDbToVm = (db: LorcanaDbCard): LorcanaCard => ({
  uuid: db.Unique_ID,
  name: db.Name,
  setCode: db.Set_ID ?? '',
  rarity: db.Rarity,
  imageUrl: db.Image ?? '',
  version: '', // TODO: parse version if needed
  isLorcana: true,
}); 