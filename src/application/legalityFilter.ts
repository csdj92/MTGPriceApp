import type { ExtendedCard } from '../types/card';

// Standard sets that are currently legal (this would need regular updates)
const STANDARD_LEGAL_SETS = [
  'adr', // Aetherdrift (replacing Foundations since it's the next Standard set)
  'fdn', // Foundations
  'hoh', // Duskmourn: House of Horror
  'blb', // Bloomburrow
  'otj', // Outlaws of Thunder Junction
  'mkm', // Murders at Karlov Manor
  'lci', // The Lost Caverns of Ixalan
  'woe', // Wilds of Eldraine
  'mam', // March of the Machine: The Aftermath
  'mom', // March of the Machine
  'one', // Phyrexia: All Will Be One
  'bro', // The Brothers' War
  'dmu', // Dominaria United
];

// Modern started from 8th Edition
const MODERN_STARTING_SET = '8ED';

interface FormatRules {
  minDeckSize: number;
  maxDeckSize: number | null;
  maxCopies: number;
  allowedInCommandZone: boolean;
}

const FORMAT_RULES: Record<string, FormatRules> = {
  standard: {
    minDeckSize: 60,
    maxDeckSize: 60,
    maxCopies: 4,
    allowedInCommandZone: false,

  },
  modern: {
    minDeckSize: 60,
    maxDeckSize: 60,
    maxCopies: 4,
    allowedInCommandZone: false,

  },
  legacy: {
    minDeckSize: 60,
    maxDeckSize: 60,
    maxCopies: 4,
    allowedInCommandZone: false,
  },
  commander: {
    minDeckSize: 100,
    maxDeckSize: 100,
    maxCopies: 1,
    allowedInCommandZone: true,
  },
};

// Check if a card is from a Standard-legal set
function isInStandardLegalSet(card: ExtendedCard): boolean {
  return STANDARD_LEGAL_SETS.includes(card.setCode.toLowerCase());
}

// Check if a card is Modern-legal based on set
function isModernLegalSet(card: ExtendedCard): boolean {
  // This is a simplified check - would need proper set chronology
  return card.setCode >= MODERN_STARTING_SET;
}

// Check color identity for Commander
function checkColorIdentity(card: ExtendedCard, commanderColors?: string[]): boolean {
  if (!commanderColors) return true; // If no commander selected yet, allow all colors
  
  const cardColors = card.colorIdentity || [];
  return cardColors.every(color => commanderColors.includes(color));
}

// Check if card can be a commander
function canBeCommander(card: ExtendedCard): boolean {
  const isLegendaryCreature = card.type.toLowerCase().includes('legendary') && 
                             card.type.toLowerCase().includes('creature');
  const hasCommanderText = card.text ? card.text.toLowerCase().includes('can be your commander') : false;
  return isLegendaryCreature || hasCommanderText;
}

export function isCardLegalForFormat(
  card: ExtendedCard, 
  format: string,
  options?: {
    commanderColors?: string[],
    isCommander?: boolean
  }
): boolean {
  if (!card.legalities) return false;
  const status = card.legalities[format.toLowerCase()];
  if (!status) return false;
  const lowerStatus = status.toLowerCase();

  // Basic format legality check
  let isLegal = false;

  switch (format.toLowerCase()) {
    case 'standard':
      isLegal = lowerStatus === 'legal' && isInStandardLegalSet(card);
      break;
    
    case 'modern':
      isLegal = lowerStatus === 'legal' && isModernLegalSet(card);
      break;
    
    case 'legacy':
      isLegal = lowerStatus === 'legal' || lowerStatus === 'restricted';
      break;
    
    case 'commander':
      isLegal = lowerStatus === 'legal';
      
      // Additional Commander-specific checks
      if (isLegal && options) {
        // Check if this card is being evaluated as a commander
        if (options.isCommander) {
          isLegal = canBeCommander(card);
        }
        // Check color identity
        if (options.commanderColors) {
          isLegal = isLegal && checkColorIdentity(card, options.commanderColors);
        }
      }
      break;
    
    default:
      return false;
  }

  return isLegal;
}

export function filterLegalCards(
  cards: ExtendedCard[], 
  format: string,
  options?: {
    commanderColors?: string[],
    isCommander?: boolean
  }
): ExtendedCard[] {
  return cards.filter(card => isCardLegalForFormat(card, format, options));
}

export function getFormatRules(format: string): FormatRules | undefined {
  return FORMAT_RULES[format.toLowerCase()];
}

// Helper function to validate deck size
export function isDeckSizeValid(format: string, deckSize: number): boolean {
  const rules = FORMAT_RULES[format.toLowerCase()];
  if (!rules) return false;
  
  return deckSize >= rules.minDeckSize && 
         (rules.maxDeckSize === null || deckSize <= rules.maxDeckSize);
}

// Helper function to check if number of copies is valid
export function isCardCopyCountValid(format: string, count: number): boolean {
  const rules = FORMAT_RULES[format.toLowerCase()];
  if (!rules) return false;
  
  return count <= rules.maxCopies;
} 