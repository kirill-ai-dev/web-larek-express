import { SaxesParser } from 'saxes';

const svgNamespace = 'http://www.w3.org/2000/svg';
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const allowedElements = new Set([
  'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textpath', 'title', 'desc', 'symbol', 'use', 'lineargradient',
  'radialgradient', 'stop', 'pattern', 'clippath', 'mask', 'filter', 'feblend',
  'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feconvolvematrix',
  'fediffuselighting', 'fedisplacementmap', 'fedistantlight', 'fedropshadow',
  'feflood', 'fefunca', 'fefuncb', 'fefuncg', 'fefuncr', 'fegaussianblur',
  'femerge', 'femergenode', 'femorphology', 'feoffset', 'fepointlight',
  'fespecularlighting', 'fespotlight', 'fetile', 'feturbulence',
]);

/**
 * Разбирает SVG как XML, включая пространства имён и сущности в атрибутах.
 * Принимает статичные фигуры и фильтры, запрещает код, CSS и внешние ресурсы.
 */
const isSafeSvg = (content: string): boolean => {
  let valid = true;
  let rootSeen = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { valid = false; });
  parser.on('processinginstruction', () => { valid = false; });
  parser.on('opentag', (tag) => {
    if (!rootSeen) {
      rootSeen = true;
      if (tag.local !== 'svg') valid = false;
    }
    if ((tag.uri !== '' && tag.uri !== svgNamespace)
      || !allowedElements.has(tag.local.toLowerCase())) valid = false;
    Object.values(tag.attributes).forEach((attribute) => {
      if (attribute.uri === 'http://www.w3.org/2000/xmlns/') return;
      const name = attribute.local.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'style' || name === 'base') valid = false;
      if (attribute.uri && ![xlinkNamespace, 'http://www.w3.org/XML/1998/namespace']
        .includes(attribute.uri)) valid = false;
      if (name === 'href' && !/^#[a-z_][\w:.-]*$/i.test(value)) valid = false;
      // CSS-экранирование и URL разрешены только в виде ссылки на элемент этого SVG.
      if (/[\\@]/.test(value) || /[a-z][a-z\d+.-]*\s*:/i.test(value)
        || /url\s*\(/i.test(value.replace(/url\(\s*["']?#[\w:.-]+["']?\s*\)/gi, ''))) {
        valid = false;
      }
    });
  });
  try {
    parser.write(content).close();
    return valid && rootSeen;
  } catch (_error) {
    return false;
  }
};

export default isSafeSvg;
