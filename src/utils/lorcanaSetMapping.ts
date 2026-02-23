export const LORCANA_SET_CODE_TO_NUMBER: Record<string, number> = {
  TFC: 1, // The First Chapter
  ROF: 2, // Rise of the Floodborn
  INK: 3, // Into the Inklands
  URS: 4, // Ursula's Return
  SSK: 5, // Shimmering Skies
  AZS: 6, // Azurite Sea
  ARI: 7, // Archazia's Island
  ROJ: 8, // Reign of Jafar
  FAB: 9, // Fabled
  WHI: 10, // Whispers in the Well
};

const SET_CODE_ALIASES: Record<string, string> = {
  JAF: "ROJ",
};

export const LORCANA_SET_NUMBER_TO_CODE: Record<string, string> = Object.entries(
  LORCANA_SET_CODE_TO_NUMBER
).reduce((acc, [code, num]) => {
  acc[String(num)] = code;
  return acc;
}, {} as Record<string, string>);

const normalizeInput = (
  setIdentifier?: string | number | null
): string | null => {
  if (setIdentifier === null || setIdentifier === undefined) {
    return null;
  }

  const normalized = String(setIdentifier).trim().toUpperCase();
  return normalized || null;
};

const applyAlias = (setCode: string): string => {
  return SET_CODE_ALIASES[setCode] || setCode;
};

export const getLorcanaSetNumberFromIdentifier = (
  setIdentifier?: string | number | null
): number | null => {
  const normalized = normalizeInput(setIdentifier);
  if (!normalized) {
    return null;
  }

  const canonical = applyAlias(normalized);

  if (/^\d+$/.test(canonical)) {
    const numeric = parseInt(canonical, 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  return LORCANA_SET_CODE_TO_NUMBER[canonical] ?? null;
};

export const getLorcanaSetCodeFromIdentifier = (
  setIdentifier?: string | number | null
): string | null => {
  const normalized = normalizeInput(setIdentifier);
  if (!normalized) {
    return null;
  }

  const canonical = applyAlias(normalized);

  if (LORCANA_SET_CODE_TO_NUMBER[canonical]) {
    return canonical;
  }

  if (/^\d+$/.test(canonical)) {
    return LORCANA_SET_NUMBER_TO_CODE[canonical] || null;
  }

  return null;
};

// Prefer canonical set codes where known, but keep unknown set identifiers usable.
export const getCanonicalSetCodeForStorage = (
  setIdentifier?: string | number | null
): string | null => {
  const normalized = normalizeInput(setIdentifier);
  if (!normalized) {
    return null;
  }

  const mapped = getLorcanaSetCodeFromIdentifier(normalized);
  if (mapped) {
    return mapped;
  }

  return applyAlias(normalized);
};

// Lorcast often provides numeric set codes (e.g. "9", "10"), map those to canonical set IDs.
export const mapLorcastSetCodeToCanonicalSetCode = (
  setCode?: string | number | null
): string | null => {
  const normalized = normalizeInput(setCode);
  if (!normalized) {
    return null;
  }

  const canonical = applyAlias(normalized);
  if (/^\d+$/.test(canonical)) {
    return LORCANA_SET_NUMBER_TO_CODE[canonical] || null;
  }

  return LORCANA_SET_CODE_TO_NUMBER[canonical] ? canonical : null;
};

export const buildLorcanaUniqueId = (
  setIdentifier: string | number | null | undefined,
  collectorNumber: string | number | null | undefined
): string | null => {
  const setCode = getCanonicalSetCodeForStorage(setIdentifier);
  const collector = collectorNumber === null || collectorNumber === undefined
    ? ""
    : String(collectorNumber).trim();

  if (!setCode || !collector) {
    return null;
  }

  return `${setCode}-${collector}`;
};

export const extractSetIdentifierFromDescription = (
  description?: string | null
): string | null => {
  if (!description) {
    return null;
  }

  const setIdMatch = description.match(/\(([^)]+)\)\s*$/);
  return setIdMatch?.[1]?.trim() || null;
};
