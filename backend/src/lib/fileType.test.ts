import { describe, it, expect } from 'vitest';
import { detectFileType } from './fileType';

describe('detectFileType', () => {
  it('détecte un PDF via sa signature "%PDF"', () => {
    const buffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n...', 'latin1');
    expect(detectFileType(buffer)).toBe('application/pdf');
  });

  it('détecte un JPEG via sa signature FF D8 FF', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectFileType(buffer)).toBe('image/jpeg');
  });

  it('détecte un PNG via sa signature 89 50 4E 47 0D 0A 1A 0A', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectFileType(buffer)).toBe('image/png');
  });

  it("rejette un fichier renommé en .pdf mais dont le contenu n'est pas un PDF (falsification de type)", () => {
    const buffer = Buffer.from('<html><body>pas un pdf</body></html>', 'latin1');
    expect(detectFileType(buffer)).toBeNull();
  });

  it('rejette un exécutable (signature MZ) déguisé en image', () => {
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(detectFileType(buffer)).toBeNull();
  });

  it('rejette un buffer vide ou trop court', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
