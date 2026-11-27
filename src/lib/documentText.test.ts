import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { docxXmlText, readDocumentText, slideXmlText } from "./documentText";

/*
  Reading a dropped document's words in the browser (lib/documentText), so a large Word or PowerPoint file never has to
  be uploaded: only the parts holding the words are unpacked, however many pictures the file carries.
*/

const slide = (text: string) => `<p:sld><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sld>`;

describe("reading a document in the browser", () => {
  it("reads a PowerPoint deck's slides in order, ignoring its pictures, however big the file", async () => {
    // About 51 MB of "pictures", stored without compression as decks' media often are.
    const media = new Uint8Array(51 * 1024 * 1024);
    const deck = zipSync(
      {
        "ppt/presentation.xml": strToU8("<p:presentation/>"),
        "ppt/slides/slide2.xml": strToU8(slide("Kingsgate led to eight new clients &amp; a return visit.")),
        "ppt/slides/slide1.xml": strToU8(slide("The TACC story")),
        "ppt/media/image1.png": [media, { level: 0 }],
      },
      { level: 6 },
    );
    expect(deck.byteLength).toBeGreaterThan(50 * 1024 * 1024);
    const d = await readDocumentText(new File([deck], "TACC.pptx"));
    expect(d).toEqual({
      name: "TACC.pptx",
      kind: "PowerPoint",
      parts: 2,
      text: "A slide deck: TACC.pptx\n\n[Slide 1]\nThe TACC story\n\n[Slide 2]\nKingsgate led to eight new clients & a return visit.",
    });
  });

  it("reads a Word document's paragraphs", async () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Growth begins with trust</w:t></w:r></w:p><w:p><w:r><w:t>Do the right thing by people.</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml), "word/media/photo.jpg": new Uint8Array(1000) });
    const d = await readDocumentText(new File([docx], "notes.docx"));
    expect(d).toMatchObject({ kind: "Word", text: "Growth begins with trust\nDo the right thing by people." });
  });

  it("reads text as it is, and turns away old Office files and anything else", async () => {
    expect((await readDocumentText(new File(["Hello there"], "brief.txt", { type: "text/plain" }))).text).toBe("Hello there");
    await expect(readDocumentText(new File([new Uint8Array(10)], "deck.ppt"))).rejects.toThrow(/\.pptx/);
    await expect(readDocumentText(new File([new Uint8Array(10)], "report.doc"))).rejects.toThrow(/\.docx/);
    await expect(readDocumentText(new File([new Uint8Array(10)], "photo.jpg"))).rejects.toThrow(/Drop a Word/);
  });

  it("keeps the words and drops the markup", () => {
    expect(slideXmlText(slide("A &quot;quote&quot; &#8211; and more"))).toBe('A "quote" – and more');
    expect(docxXmlText("<w:p><w:r><w:t>One</w:t><w:tab/><w:t>two</w:t></w:r></w:p>")).toBe("One\ttwo");
  });
});
