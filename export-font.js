import regular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import bold from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';

let fontCSS;
export async function embedExportFont(svg) {
  // An SVG rendered through Image cannot inherit the page's loaded web fonts.
  // Embed our local font bytes so drawings travel with the same typography.
  if (!fontCSS)
    fontCSS = Promise.all(
      [
        [regular, 400],
        [bold, 700],
      ].map(async ([url, weight]) => {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error('The drawing font could not load. Reload and try exporting again.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
        return `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${encoded}) format('woff2');font-weight:${weight};font-style:normal;}`;
      }),
    )
      .then((r) => r.join(''))
      .catch((error) => {
        fontCSS = null;
        throw error;
      });
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await fontCSS;
  svg.prepend(style);
}
