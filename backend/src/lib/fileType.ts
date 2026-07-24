// Vérifie le type réel d'un fichier via ses "magic bytes" (signature
// binaire en tête de fichier), plutôt que de faire confiance au
// Content-Type envoyé par le navigateur ou à l'extension du nom de
// fichier — les deux sont trivialement falsifiables côté client, et le
// prompt d'origine exige explicitement une "vérification du type MIME
// réel" pour l'upload de factures.

export type DetectedFileType = 'application/pdf' | 'image/jpeg' | 'image/png' | null;

export function detectFileType(buffer: Buffer): DetectedFileType {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

export const ALLOWED_INVOICE_FILE_TYPES: DetectedFileType[] = ['application/pdf', 'image/jpeg', 'image/png'];
