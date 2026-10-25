/** A CJK font the PDF doesn't embed: pdf.js needs the UniGB-UCS2-H CMap to read its text. */
const CJK_FONT =
  "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor << /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >> >>] >>";

/**
 * A tiny PDF built byte by byte: one Letter-size page per label, each a
 * colored sheet with its label in Helvetica (and, with `cjk`, a line of
 * Chinese in a font it doesn't embed). Offsets in the cross-reference table
 * are computed, so pdf.js reads it without repairing anything.
 */
export function samplePdf(labels: readonly string[], { cjk = false } = {}): Buffer {
  const fonts = 3 + labels.length * 2;
  const resources = `<< /Font << /F1 ${fonts} 0 R /F2 ${fonts + 1} 0 R >> >>`;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${labels.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${labels.length} >>`,
  ];
  labels.forEach((label, index) => {
    const chinese = cjk ? " BT /F2 48 Tf 72 560 Td <4E2D6587> Tj ET" : "";
    const content = `0.85 0.99 0.42 rg 0 0 612 792 re f 0.05 0.33 0.8 rg BT /F1 64 Tf 72 680 Td (${label}) Tj ET${chinese}`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + index * 2} 0 R /Resources ${resources} >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", CJK_FONT);

  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
