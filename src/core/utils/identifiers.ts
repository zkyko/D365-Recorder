/**
 * Utilities for sanitizing text into valid JavaScript identifiers
 */

/**
 * Remove hotkey hints like "(Alt+N)" or "(alt+enter)" from text
 */
export function stripHotkeyHints(raw: string): string {
  // Remove things like "(Alt+N)" or "(alt+enter)" at the start or anywhere
  return raw.replace(/\(\s*alt\+[\w\s]+\s*\)\s*/gi, '').trim();
}

/**
 * Drop characters in the Private Use Area and other non-ASCII glyphs
 */
export function stripWeirdGlyphs(raw: string): string {
  // Drop Private Use Area (U+E000 to U+F8FF) and other problematic Unicode ranges
  return raw.replace(/[\uE000-\uF8FF\u200B-\u200D\uFEFF]/g, '');
}

/**
 * Normalize text by removing hotkeys and glyphs
 */
export function normalizeText(raw: string): string {
  return stripWeirdGlyphs(stripHotkeyHints(raw)).trim();
}

/**
 * Convert text to PascalCase
 * Example: "Mode of delivery" -> "ModeOfDelivery"
 */
export function toPascalCase(raw: string): string {
  const cleaned = normalizeText(raw);
  if (!cleaned) return 'Unnamed';

  return cleaned
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert text to camelCase
 * Example: "Mode of delivery" -> "modeOfDelivery"
 */
export function toCamelCase(raw: string): string {
  const pascal = toPascalCase(raw);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Ensure the identifier is a valid JS identifier (for fields/methods)
 * Example: "(Alt+N) New" -> "new"
 *          "Mode of delivery" -> "modeOfDelivery"
 */
export function makeSafeIdentifier(raw: string): string {
  let id = toCamelCase(raw);

  // Remove any remaining invalid characters (just in case)
  id = id.replace(/[^a-zA-Z0-9_$]/g, '');

  // Identifiers can't start with a digit
  if (/^[0-9]/.test(id)) {
    id = '_' + id;
  }

  // Ensure it's not empty
  if (!id) {
    id = 'unnamed';
  }

  return id;
}

/**
 * Generate a page class name from a page caption
 * Example: "Sales Order Details - Price Lock" -> "SalesOrderDetailsPage"
 */
export function makePageClassName(caption: string, kind: 'ListPage' | 'DetailsPage' | 'Dialog' | 'Workspace' | 'SimpleList' | 'TableOfContents' | 'Unknown'): string {
  // Take the first part before dash (main page name)
  const cleaned = normalizeText(caption).split('-')[0].trim();
  const base = toPascalCase(cleaned);

  switch (kind) {
    case 'DetailsPage':
      return `${base}Page`;
    case 'ListPage':
      return `${base}ListPage`;
    case 'Workspace':
      return `${base}Workspace`;
    case 'Dialog':
      return `${base}Dialog`;
    case 'SimpleList':
      return `${base}ListPage`;
    case 'TableOfContents':
      return `${base}Page`;
    default:
      return `${base}Page`;
  }
}

