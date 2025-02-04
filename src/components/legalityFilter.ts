import type { ExtendedCard } from '../types/card';

export function isCardLegalForStandard(card: ExtendedCard): boolean {
  if (!card.legalities || !card.legalities.standard) {
    return false;
  }
  return card.legalities.standard.toLowerCase() === 'legal';
}

export function filterLegalCards(cards: ExtendedCard[], format: string = 'standard'): ExtendedCard[] {
  return cards.filter(card => {
    if (!card.legalities || !card.legalities[format.toLowerCase()]) {
      return false;
    }
    return card.legalities[format.toLowerCase()].toLowerCase() === 'legal';
  });
} 