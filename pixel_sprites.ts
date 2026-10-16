// 16x16 Mario Paint-style pixel art for the stamps. Rows are written in colour groups separated
// by spaces so they're easy to count; the spaces are stripped and every row must be 16 pixels.

const palette: Record<string, string> = {
  k: "#1b1b1f", // outline
  w: "#ffffff",
  s: "#f7c9a0", // skin
  S: "#d99a6c", // skin shadow
  h: "#7b4a26", // brown hair
  r: "#e8696b", // rosy red
  p: "#ff9fbc", // eraser pink
  P: "#e06d92", // eraser shadow
  y: "#ffd23f", // yellow
  Y: "#e3a90b", // yellow shadow
  b: "#9cc9ff", // sad blue
  g: "#e4e4e4", // einstein white-grey hair
  G: "#9b9b9b", // grey
  n: "#3c6bd1", // floppy blue
  o: "#f2b880", // pencil wood
  d: "#b07040", // dog ears
};

export type SpriteName = "pencil" | "human" | "einstein" | "eraser" | "smile" | "frown" | "undoDog" | "floppy" | "book";

const spriteRows: Record<SpriteName, string[]> = {
  human: [
    "........ ........",
    "..... kkkkkk .....",
    "... kk hhhhhh kk ...",
    ".. k hhhhhhhhhh k ..",
    ". k hhhhhhhhhhhh k .",
    ". k hhhhhhhhhhhh k .",
    "k hh ssss hh ssss hh k",
    "k h ssssssssssss h k",
    "k h sss k ssss k sss h k",
    "k h sss k ssss k sss h k",
    "k h s rr ssssss rr s h k",
    ". k ss k ssssss k ss k .",
    ". k sss kkkkkk sss k .",
    ".. k ssssssssss k ..",
    "... kk ssssss kk ...",
    "..... kkkkkk .....",
  ],
  einstein: [
    ".. g .. gg .. gg .. g ..",
    ". ggg gggggggg ggg .",
    "gggg gggggggg gggg",
    "ggg k ssssssss k ggg",
    "gg k ssssssssss k gg",
    "gg k s GGGGGGGG s k gg",
    "g k kkkkk ss kkkkk k g",
    "g k k www k kk k www k k g",
    "g k k wkw k ss k wkw k k g",
    "g k kkkkk ss kkkkk k g",
    ". k sssss SS sssss k .",
    ". k gggggggggggg k .",
    ". k gg ssssssss gg k .",
    ".. k sss kkkk sss k ..",
    "... kk ssssss kk ...",
    "..... kkkkkk .....",
  ],
  eraser: [
    "........ ........",
    "........ ........",
    "........ ........",
    ". kkkkkkkkkkkkkk .",
    ". k ppppp wwww ppp k .",
    ". k ppppp wnnw ppp k .",
    ". k ppppp wnnw ppp k .",
    ". k ppppp wwww ppp k .",
    ". k PPPPPPPPPPPP k .",
    ". kkkkkkkkkkkkkk .",
    "........ ........",
    "... p .. p ... p .....",
    "..... p ... p ......",
    "........ ........",
    "........ ........",
    "........ ........",
  ],
  smile: [
    "........ ........",
    "..... kkkkkk .....",
    "... kk yyyyyy kk ...",
    ".. k yyyyyyyyyy k ..",
    ". k yyyyyyyyyyyy k .",
    ". k yyy k yyyy k yyy k .",
    "k yyyy k yyyy k yyyy k",
    "k yyyy k yyyy k yyyy k",
    "k yyyyyyyyyyyyyy k",
    "k yy k yyyyyyyy k yy k",
    "k yyy k yyyyyy k yyy k",
    ". k yyy kkkkkk yyy k .",
    ". k yyyyyyyyyyyy k .",
    ".. k yyyyyyyyYY k ..",
    "... kk YYYYYY kk ...",
    "..... kkkkkk .....",
  ],
  frown: [
    "........ ........",
    "..... kkkkkk .....",
    "... kk bbbbbb kk ...",
    ".. k bbbbbbbbbb k ..",
    ". k bbbbbbbbbbbb k .",
    ". k bbb k bbbb k bbb k .",
    "k bbbb k bbbb k bbbb k",
    "k bbbb k bbbb k bbbb k",
    "k bbbbbbbbbbbbbb k",
    "k bbbbbbbbbbbbbb k",
    "k bbbb kkkkkk bbbb k",
    ". k bb k bbbbbb k bb k .",
    ". k b k bbbbbbbb k b k .",
    ".. k bbbbbbbbbb k ..",
    "... kk bbbbbb kk ...",
    "..... kkkkkk .....",
  ],
  pencil: [
    "........ ........",
    "............ ppp .",
    "........... ppp ..",
    ".......... GGG ...",
    "......... yyY ....",
    "........ yyY .....",
    "....... yyY ......",
    "...... yyY .......",
    "..... yyY ........",
    ".... yyY .........",
    "... yyY ..........",
    ".. ooo ...........",
    ". oo .............",
    "kk ..............",
    "k ...............",
    "........ ........",
  ],
  undoDog: [
    "........ ........",
    ".. dd ........ dd ..",
    ". dddd ...... dddd .",
    ". dddd wwwwww dddd .",
    ". ddd wwwwwwww ddd .",
    ". dd wwwwwwwwww dd .",
    ".. d ww k wwww k ww d ..",
    "... ww k wwww k ww ...",
    "... wwwwwwwwww ...",
    "... wwww kk wwww ...",
    "... www k kk k www ...",
    ".... ww k rr k ww ....",
    "..... ww rr ww .....",
    "...... wwww ......",
    "........ ........",
    "........ ........",
  ],
  floppy: [
    "........ ........",
    ". kkkkkkkkkkkkkk .",
    ". k nn GGGGGG nnnn k .",
    ". k nn GG kk GG nnnn k .",
    ". k nn GGGGGG nnnn k .",
    ". k nnnnnnnnnnnn k .",
    ". k nnnnnnnnnnnn k .",
    ". k n wwwwwwwwww n k .",
    ". k n w GGGGGGGG w n k .",
    ". k n wwwwwwwwww n k .",
    ". k n w GGGGGGGG w n k .",
    ". k n wwwwwwwwww n k .",
    ". k nnnnnnnnnnnn k .",
    ". kkkkkkkkkkkkkk .",
    "........ ........",
    "........ ........",
  ],
  book: [
    "........ ........",
    "... kkkkkkkkkk ...",
    "... k kwkkwwkw k ...",
    "... k wkwwkkwk k ...",
    "... k kwwwwwwk k ...",
    "... k kwkkkkwk k ...",
    "... k kwwwwwwk k ...",
    "... k kwkkkkwk k ...",
    "... k kwwwwwwk k ...",
    "... k wkwkkwkw k ...",
    "... k kwwkwkkw k ...",
    "... k wkkwkwwk k ...",
    "... kkkkkkkkkk ...",
    "........ ........",
    "........ ........",
    "........ ........",
  ],
};

const spritePixels: Record<SpriteName, string[]> = Object.fromEntries(
  Object.entries(spriteRows).map(([spriteName, rows]) => {
    const pixelRows = rows.map((row) => row.replaceAll(" ", ""));
    pixelRows.forEach((pixelRow, rowIndex) => {
      if (pixelRow.length !== 16) throw new Error(`Sprite "${spriteName}" row ${rowIndex} is ${pixelRow.length} pixels wide, not 16: "${rows[rowIndex]}"`);
    });
    if (pixelRows.length !== 16) throw new Error(`Sprite "${spriteName}" has ${pixelRows.length} rows, not 16`);
    return [spriteName, pixelRows];
  }),
) as Record<SpriteName, string[]>;

export function spriteSvg(spriteName: SpriteName, sizeInPixels = 48): string {
  const rects = spritePixels[spriteName].flatMap((pixelRow, rowIndex) =>
    [...pixelRow].flatMap((colourCode, columnIndex) =>
      colourCode === "." ? [] : [`<rect x="${columnIndex}" y="${rowIndex}" width="1.02" height="1.02" fill="${palette[colourCode]}"/>`],
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${sizeInPixels}" height="${sizeInPixels}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

/** The stamp itself as a mouse cursor, so painting feels like holding it. */
export function spriteCursor(spriteName: SpriteName): string {
  return `url("data:image/svg+xml,${encodeURIComponent(spriteSvg(spriteName, 32))}") 16 16, crosshair`;
}
