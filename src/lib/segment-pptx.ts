import { readFile } from "node:fs/promises";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { COLUMN_GAP, LABEL_HEIGHT, PAGE, PLAN_COLUMNS, ROUND_COLUMNS, blockHeight, columnWidth, type Slide } from "@/lib/segment-deck";

/** Desenha o roteiro da apresentação em um arquivo .pptx editável. Só no servidor. */
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const C = { forest: "17392F", brand: "00754A", accent: "EF8943", soft: "F2F7F4", line: "DFE7E3", ink: "1B2A25", ink3: "5F6F69", white: "FFFFFF" };
const FONT = "Calibri";
const WIDTH = PAGE.width - 2 * PAGE.margin;

async function logo(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "brand", "logo-selbetti-negativo.png"));
    return `image/png;base64,${file.toString("base64")}`;
  } catch {
    return null; // sem o logo a apresentação continua valendo
  }
}

function header(slide: PptxGenJS.Slide, title: string, subtitle: string, number: number) {
  slide.background = { color: C.white };
  slide.addShape("rect", { x: 0, y: 0, w: PAGE.width, h: 0.12, fill: { color: C.brand } });
  slide.addText(title, { x: PAGE.margin, y: 0.32, w: WIDTH, h: 0.62, margin: 0, fontFace: FONT, fontSize: title.length > 60 ? 22 : 28, bold: true, color: C.forest, valign: "middle" });
  if (subtitle) slide.addText(subtitle, { x: PAGE.margin, y: 0.98, w: WIDTH, h: 0.3, margin: 0, fontFace: FONT, fontSize: 13, color: C.ink3 });
  slide.addText("Orbitta360 · Selbetti · uso interno", { x: PAGE.margin, y: 7.08, w: 6, h: 0.25, margin: 0, fontFace: FONT, fontSize: 9, color: C.ink3 });
  slide.addText(String(number), { x: PAGE.width - PAGE.margin - 1, y: 7.08, w: 1, h: 0.25, margin: 0, fontFace: FONT, fontSize: 9, color: C.ink3, align: "right" });
}

const th = (text: string): PptxGenJS.TableCell => ({ text, options: { bold: true, color: C.white, fill: { color: C.forest } } });
const td = (text: string, options: PptxGenJS.TableCellProps = {}): PptxGenJS.TableCell => ({ text, options });

function table(slide: PptxGenJS.Slide, head: string[], rows: PptxGenJS.TableCell[][], colW: number[], fontSize: number) {
  slide.addTable([head.map(th), ...rows], {
    x: PAGE.margin, y: PAGE.top, w: WIDTH, colW, fontFace: FONT, fontSize, color: C.ink, valign: "top", margin: 0.06,
    border: { type: "solid", color: C.line, pt: 1 }, autoPage: false,
  });
}

export async function renderPptx(slides: Slide[], title: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  pptx.author = "Orbitta360";
  pptx.company = "Selbetti";
  const image = await logo();

  slides.forEach((s, index) => {
    const slide = pptx.addSlide();
    if (s.kind === "capa") {
      slide.background = { color: C.forest };
      if (image) slide.addImage({ data: image, x: 0.9, y: 0.8, w: 2.65, h: 0.7 });
      slide.addShape("rect", { x: 0.9, y: 2.55, w: 1.2, h: 0.09, fill: { color: C.accent } });
      slide.addText("Portfólio 2027", { x: 0.9, y: 2.8, w: 11.5, h: 0.5, margin: 0, fontFace: FONT, fontSize: 22, color: "80BAA5" });
      slide.addText(`Segmento ${s.segment}`, { x: 0.9, y: 3.35, w: 11.5, h: 1.2, margin: 0, fontFace: FONT, fontSize: s.segment.length > 28 ? 40 : 52, bold: true, color: C.white, valign: "top" });
      slide.addText([s.leader && `Líder: ${s.leader}`, s.date].filter(Boolean).join(" · "), { x: 0.9, y: 5.7, w: 11.5, h: 0.4, margin: 0, fontFace: FONT, fontSize: 16, color: C.white });
      slide.addText("Uso interno", { x: 0.9, y: 6.7, w: 4, h: 0.3, margin: 0, fontFace: FONT, fontSize: 11, color: "80BAA5" });
      return;
    }

    header(slide, s.title, s.subtitle, index + 1);

    if (s.kind === "texto") {
      const w = columnWidth(s.columns.length);
      s.columns.forEach((column, i) => {
        const x = PAGE.margin + i * (w + COLUMN_GAP);
        let y: number = PAGE.top;
        for (const b of column.blocks) {
          slide.addText(b.label.toUpperCase(), { x, y, w, h: LABEL_HEIGHT, margin: 0, fontFace: FONT, fontSize: 12, bold: true, color: C.brand, valign: "middle" });
          y += LABEL_HEIGHT;
          const h = Math.min(blockHeight(b, w, column.size), PAGE.bottom - y);
          slide.addText(b.text, { x, y, w, h, margin: 0, fontFace: FONT, fontSize: column.size, color: C.ink, valign: "top" });
          y += h + 0.1;
        }
      });
    } else if (s.kind === "resumo") {
      const w = columnWidth(2);
      s.boxes.forEach((box, i) => {
        const x = PAGE.margin + (i % 2) * (w + COLUMN_GAP);
        const y = PAGE.top + Math.floor(i / 2) * 2.75;
        slide.addShape("rect", { x, y, w, h: 2.6, fill: { color: C.soft }, line: { color: C.line, width: 1 } });
        slide.addText(box.title, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: 0.34, margin: 0, fontFace: FONT, fontSize: 15, bold: true, color: C.forest });
        slide.addText(box.subtitle, { x: x + 0.15, y: y + 0.42, w: w - 0.3, h: 0.24, margin: 0, fontFace: FONT, fontSize: 11, color: C.ink3 });
        slide.addText(box.lines.map((text) => ({ text, options: { bullet: { indent: 12 }, breakLine: true } })), {
          x: x + 0.15, y: y + 0.72, w: w - 0.3, h: 1.8, margin: 0, fontFace: FONT, fontSize: box.size, color: C.ink, valign: "top",
        });
      });
    } else if (s.kind === "rodada") {
      table(slide, ["Oferta", "Principal dor do cliente", "Proposta de valor"], s.rows.map((r) => [
        { text: [{ text: r.offer, options: { bold: true, color: C.forest, breakLine: true } }, { text: `BU ${r.bu}`, options: { color: C.ink3, fontSize: 10 } }] },
        td(r.pain), td(r.value),
      ]), ROUND_COLUMNS, 12);
    } else {
      table(slide, ["Rodada", "BU", "Tipo", "Ação", "Responsável", "Prazo"], s.rows.map((r) => [
        td(r.round), td(r.bu), td(r.type),
        { text: [{ text: r.headline, options: { bold: true, breakLine: !!r.detail } }, ...(r.detail ? [{ text: r.detail, options: { color: C.ink3 } }] : [])] },
        td(r.owner), td(r.due),
      ]), PLAN_COLUMNS, 11);
    }
  });

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
