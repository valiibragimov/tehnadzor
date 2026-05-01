const FONT_FILE = "Roboto-Regular.ttf";
const FONT_NAME = "Roboto";
const FONT_STYLE = "normal";

let pdfFontLoaded = false;
let pdfFontBase64 = "";
let pdfFontLoading = null;
const fontRegisteredDocs = new WeakSet();

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function ensurePdfFontLoaded() {
  if (pdfFontLoaded) return true;
  if (pdfFontLoading) {
    await pdfFontLoading;
    return pdfFontLoaded;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.warn("jsPDF не загружен, экспорт PDF недоступен");
    return false;
  }

  pdfFontLoading = (async () => {
    try {
      const resp = await fetch("./fonts/Roboto-Regular.ttf");
      if (!resp.ok) {
        console.error("Не удалось загрузить шрифт для PDF:", resp.status);
        return;
      }
      const buf = await resp.arrayBuffer();
      pdfFontBase64 = arrayBufferToBase64(buf);
      pdfFontLoaded = Boolean(pdfFontBase64);
      if (pdfFontLoaded) {
        console.log("PDF-шрифт Roboto загружен.");
      }
    } catch (e) {
      pdfFontLoaded = false;
      pdfFontBase64 = "";
      console.error("Ошибка загрузки PDF-шрифта:", e);
    } finally {
      if (!pdfFontLoaded) {
        pdfFontLoading = null;
      }
    }
  })();

  await pdfFontLoading;
  return pdfFontLoaded;
}

function registerPdfFont(doc) {
  if (!doc || !pdfFontLoaded || !pdfFontBase64) return false;
  if (fontRegisteredDocs.has(doc)) return true;

  if (typeof doc.addFileToVFS !== "function" || typeof doc.addFont !== "function") {
    console.warn("Текущая сборка jsPDF не поддерживает addFileToVFS/addFont");
    return false;
  }

  try {
    const hasVfsCheck = typeof doc.existsFileInVFS === "function";
    if (!hasVfsCheck || !doc.existsFileInVFS(FONT_FILE)) {
      doc.addFileToVFS(FONT_FILE, pdfFontBase64);
    }

    const fontList = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    const hasFont = fontList && hasFontInList(fontList, FONT_NAME, FONT_STYLE);

    if (!hasFont) {
      // Совместимый для jsPDF 2.5.x вызов регистрации TTF
      doc.addFont(FONT_FILE, FONT_NAME, FONT_STYLE);
    }

    const updatedFontList = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    const registered = updatedFontList && hasFontInList(updatedFontList, FONT_NAME, FONT_STYLE);
    if (!registered) {
      console.warn("Roboto не найден в getFontList() после addFont:", updatedFontList);
      return false;
    }

    fontRegisteredDocs.add(doc);
    return true;
  } catch (e) {
    console.error("Ошибка регистрации PDF-шрифта:", e);
    return false;
  }
}

function hasFontInList(fontList, fontName, style) {
  const targetName = String(fontName || "").toLowerCase();
  const targetStyle = String(style || "").toLowerCase();
  const keys = Object.keys(fontList || {});
  for (const key of keys) {
    if (key.toLowerCase() !== targetName) continue;
    const styles = Array.isArray(fontList[key]) ? fontList[key] : [];
    if (styles.some((item) => String(item || "").toLowerCase() === targetStyle)) {
      return true;
    }
  }
  return false;
}

function isPdfFontLoaded() {
  return pdfFontLoaded;
}

export { ensurePdfFontLoaded, isPdfFontLoaded, registerPdfFont };
