/**
 * A tiny PDF built byte by byte: one Letter-size page per label, each a
 * colored sheet with its label in Helvetica. Offsets in the cross-reference
 * table are computed, so pdf.js reads it without repairing anything.
 */
export function samplePdf(labels: readonly string[]): Buffer {
  const font = 3 + labels.length * 2;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${labels.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${labels.length} >>`,
  ];
  labels.forEach((label, index) => {
    const content = `0.85 0.99 0.42 rg 0 0 612 792 re f 0.05 0.33 0.8 rg BT /F1 64 Tf 72 680 Td (${label}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + index * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

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
