import mammoth from "mammoth";
import pdfParse from "pdf-parse";

/**
 * Extract plain text from an uploaded scheme document (PDF / DOCX / TXT).
 *
 * Indian-government PDFs are frequently font-encoded so badly that no text is
 * extractable — those surface a clear error and the UI offers a paste-text
 * path, exactly like the reference implementation.
 */

export class DocumentParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentParsingError";
  }
}

/** Minimum alphabetic characters before we trust the extraction. */
const MIN_ALPHABETIC_CHARS = 50;

export async function extractTextFromBytes(bytes: Buffer, filename: string): Promise<string> {
  const name = filename.toLowerCase();

  if (!bytes || bytes.length === 0) {
    throw new DocumentParsingError("The uploaded document is empty.");
  }

  let text = "";

  try {
    if (name.endsWith(".pdf")) {
      const result = await pdfParse(bytes);
      if (result.NumPages === 0) throw new DocumentParsingError("The PDF has no pages.");
      const pages = result.text
        .split(/\f/)
        .filter((page) => page.trim().length > 0)
        .map((page, index) => `--- Page ${index + 1} ---\n${page.trim()}`);
      text = pages.join("\n\n").trim();
    } else if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value.trim();
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = bytes.toString("utf8").replace(/^\uFEFF/, "").trim();
    } else {
      text = bytes.toString("utf8").trim();
    }
  } catch (error) {
    if (error instanceof DocumentParsingError) throw error;
    throw new DocumentParsingError(`Could not read "${filename}": ${String(error)}`);
  }

  const alphabetic = text.replace(/[^a-zA-Z\u0980-\u09FF]/g, "");
  if (alphabetic.length < MIN_ALPHABETIC_CHARS) {
    throw new DocumentParsingError(
      `"${filename}" has an encoding that could not be read automatically (common in ` +
        "government PDFs). Please copy the text from the document and paste it instead."
    );
  }

  return text;
}