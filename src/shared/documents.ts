export const MAX_PDF_BYTES: number = 20 * 1024 * 1024;

/** File signature validation is not a laboratory assessment or a PDF content sanitizer. */
export function validatePdfBytes(bytes: Uint8Array): void {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error("PDF_INVALID_OR_TOO_LARGE");
  const header = new TextDecoder().decode(bytes.subarray(0, 8));
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
  if (!/^(?:%PDF-1\.[0-7]|%PDF-2\.0)/u.test(header) || !tail.includes("%%EOF")) throw new Error("PDF_INVALID_CONTENT");
}
