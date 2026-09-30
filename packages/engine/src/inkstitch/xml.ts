/**
 * A small XML tree for the files Ink/Stitch writes (spec §13.4): parse, change the structure, write
 * back. No DOM — the engine runs in Node and in a web worker (CLAUDE.md, rule 4) — and no new
 * dependency; `import/svg.ts` scans tags the same way, this one keeps the tree.
 *
 * What it keeps is what the file said, not what it meant: attribute values stay as they were written
 * (escaped, in source order), text, comments, CDATA and processing instructions come back
 * unchanged, and an element without children is written self-closed. That is enough for a
 * document that goes from Ink/Stitch (inkex, lxml) through this module and back into Ink/Stitch, and
 * nothing more: no schema, no entities beyond the five predefined and numeric references, no
 * whitespace handling (`xml:space` is the writer's business).
 *
 * **Namespaces are resolved in scope.** inkex writes its own prefixes (`ns46:label`), declares them on
 * the element that needs them and re-binds the same prefix further down (`ns1` is Inkscape's on a
 * group and xlink's on the `<use>` inside it), so an attribute can only be found by the namespace
 * its prefix means at that element (`getNsAttr`), never by its prefix.
 */

export const XML_NS = {
  svg: "http://www.w3.org/2000/svg",
  inkscape: "http://www.inkscape.org/namespaces/inkscape",
  inkstitch: "http://inkstitch.org/namespace",
  xlink: "http://www.w3.org/1999/xlink",
  sodipodi: "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd",
} as const;

/** The prefixes declared on one element, and the scope it sits in. */
export type XmlScope = {
  readonly parent: XmlScope | undefined;
  readonly declared: Map<string, string>;
};

/** An attribute as written: `raw` is the value between the quotes, escaped. */
export type XmlAttr = { name: string; raw: string };

export type XmlElement = {
  kind: "element";
  /** The qualified name as written: `g`, `ns0:namedview`. */
  name: string;
  attrs: XmlAttr[];
  children: XmlNode[];
  /** The namespaces in force at this element. Elements that declare none share their parent's. */
  scope: XmlScope;
};
/** Character data as written (entities not decoded). */
export type XmlText = { kind: "text"; raw: string };
/** A comment, a CDATA section or a processing instruction, as written. */
export type XmlRaw = { kind: "raw"; raw: string };
export type XmlNode = XmlElement | XmlText | XmlRaw;

export type XmlDocument = {
  /** Everything before the root element: declaration, doctype, comments, blanks. */
  prolog: string;
  root: XmlElement;
  /** Everything after it. */
  epilog: string;
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** The five predefined entities and numeric references; any other `&name;` stays as it is. */
export function decodeXml(raw: string): string {
  const code = (whole: string, n: number): string =>
    Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  return raw.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z]+));/g, (whole, hex, dec, name) => {
    if (hex !== undefined) return code(whole, Number.parseInt(hex as string, 16));
    if (dec !== undefined) return code(whole, Number.parseInt(dec as string, 10));
    return NAMED[name as string] ?? whole;
  });
}

/**
 * Escapes a value for an attribute (`&`, `<`, `"`, and the white space a parser would otherwise
 * fold into blanks) or for text (`&`, `<`, `>`).
 */
export function encodeXml(value: string, where: "attribute" | "text"): string {
  if (where === "text")
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;")
    .replace(/\t/g, "&#9;");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const isSpace = (c: string | undefined): boolean =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

/** The namespace declarations among the attributes of one start tag. */
function declarations(attrs: XmlAttr[]): Map<string, string> {
  const declared = new Map<string, string>();
  for (const a of attrs) {
    if (a.name === "xmlns") declared.set("", decodeXml(a.raw));
    else if (a.name.startsWith("xmlns:")) declared.set(a.name.slice(6), decodeXml(a.raw));
  }
  return declared;
}

/** The scope of a new element: its parent's, unless it declares namespaces itself. */
function scopeOf(attrs: XmlAttr[], parent: XmlScope | undefined): XmlScope {
  const declared = declarations(attrs);
  if (declared.size === 0 && parent !== undefined) return parent;
  return { parent, declared };
}

/**
 * Reads one start tag at `at` (the `<`). Returns the element, where the tag ends and whether it is
 * self-closed. Quotes may hold a `>`.
 */
function readStartTag(
  s: string,
  at: number,
  parent: XmlScope | undefined,
): { element: XmlElement; end: number; selfClosed: boolean } {
  let i = at + 1;
  const nameStart = i;
  while (i < s.length && !isSpace(s[i]) && s[i] !== "/" && s[i] !== ">") i++;
  const name = s.slice(nameStart, i);
  if (name === "") throw new Error(`XML: a tag without a name at ${at}`);
  const attrs: XmlAttr[] = [];
  const done = (selfClosed: boolean, end: number) => ({
    element: { kind: "element" as const, name, attrs, children: [], scope: scopeOf(attrs, parent) },
    end,
    selfClosed,
  });
  for (;;) {
    while (isSpace(s[i])) i++;
    if (i >= s.length) throw new Error(`XML: <${name}> is not closed`);
    if (s[i] === ">") return done(false, i + 1);
    if (s[i] === "/" && s[i + 1] === ">") return done(true, i + 2);
    const attrStart = i;
    while (i < s.length && !isSpace(s[i]) && s[i] !== "=" && s[i] !== "/" && s[i] !== ">") i++;
    const attrName = s.slice(attrStart, i);
    while (isSpace(s[i])) i++;
    if (attrName === "" || s[i] !== "=") {
      throw new Error(`XML: attribute ${attrName} of <${name}> has no value`);
    }
    i++;
    while (isSpace(s[i])) i++;
    const quote = s[i];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`XML: attribute ${attrName} of <${name}> is not quoted`);
    }
    const close = s.indexOf(quote, i + 1);
    if (close < 0) throw new Error(`XML: attribute ${attrName} of <${name}> is not closed`);
    const raw = s.slice(i + 1, close);
    attrs.push({ name: attrName, raw: quote === '"' ? raw : raw.replace(/"/g, "&quot;") });
    i = close + 1;
  }
}

/** The end of a `<!DOCTYPE …>`, which may carry an internal subset in `[ … ]` with `>` in it. */
function doctypeEnd(s: string, at: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = at; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ">" && depth === 0) return i + 1;
  }
  throw new Error("XML: doctype is not closed");
}

export function parseXml(text: string): XmlDocument {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let root: XmlElement | undefined;
  let prologEnd = 0;
  let rootEnd = s.length;
  const stack: XmlElement[] = [];
  let i = 0;

  while (i < s.length) {
    if (s[i] !== "<") {
      const next = s.indexOf("<", i);
      const end = next < 0 ? s.length : next;
      const raw = s.slice(i, end);
      const open = stack[stack.length - 1];
      if (open !== undefined) open.children.push({ kind: "text", raw });
      else if (raw.trim() !== "") throw new Error("XML: text outside the root element");
      i = end;
      continue;
    }

    // Comment, CDATA, processing instruction, doctype: kept as written.
    let rawEnd = -1;
    if (s.startsWith("<!--", i)) {
      const close = s.indexOf("-->", i + 4);
      if (close < 0) throw new Error("XML: comment is not closed");
      rawEnd = close + 3;
    } else if (s.startsWith("<![CDATA[", i)) {
      const close = s.indexOf("]]>", i + 9);
      if (close < 0) throw new Error("XML: CDATA section is not closed");
      rawEnd = close + 3;
    } else if (s.startsWith("<?", i)) {
      const close = s.indexOf("?>", i + 2);
      if (close < 0) throw new Error("XML: processing instruction is not closed");
      rawEnd = close + 2;
    } else if (s.startsWith("<!", i)) {
      rawEnd = doctypeEnd(s, i);
    }
    if (rawEnd >= 0) {
      const open = stack[stack.length - 1];
      if (open !== undefined) open.children.push({ kind: "raw", raw: s.slice(i, rawEnd) });
      i = rawEnd;
      continue;
    }

    if (s[i + 1] === "/") {
      const close = s.indexOf(">", i);
      if (close < 0) throw new Error("XML: end tag is not closed");
      const name = s.slice(i + 2, close).trim();
      const open = stack.pop();
      if (open === undefined) throw new Error(`XML: </${name}> without a start tag`);
      if (open.name !== name) throw new Error(`XML: </${name}> does not close <${open.name}>`);
      i = close + 1;
      if (stack.length === 0) rootEnd = i;
      continue;
    }

    const parent = stack[stack.length - 1];
    const { element, end, selfClosed } = readStartTag(s, i, parent?.scope);
    if (parent !== undefined) parent.children.push(element);
    else if (root !== undefined) throw new Error(`XML: a second root element <${element.name}>`);
    else {
      root = element;
      prologEnd = i;
    }
    i = end;
    if (selfClosed) {
      if (stack.length === 0) rootEnd = i;
    } else stack.push(element);
  }

  if (stack.length > 0) throw new Error(`XML: <${stack[stack.length - 1]!.name}> is not closed`);
  if (root === undefined) throw new Error("XML: no root element");
  return { prolog: s.slice(0, prologEnd), root, epilog: s.slice(rootEnd) };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function write(node: XmlNode, out: string[]): void {
  if (node.kind !== "element") {
    out.push(node.raw);
    return;
  }
  out.push(`<${node.name}`);
  for (const a of node.attrs) out.push(` ${a.name}="${a.raw}"`);
  if (node.children.length === 0) {
    out.push("/>");
    return;
  }
  out.push(">");
  for (const c of node.children) write(c, out);
  out.push(`</${node.name}>`);
}

export function serializeNode(node: XmlNode): string {
  const out: string[] = [];
  write(node, out);
  return out.join("");
}

export function serializeXml(doc: XmlDocument): string {
  return doc.prolog + serializeNode(doc.root) + doc.epilog;
}

// ---------------------------------------------------------------------------
// Names, namespaces and attributes
// ---------------------------------------------------------------------------

const prefixOf = (name: string): string => {
  const colon = name.indexOf(":");
  return colon < 0 ? "" : name.slice(0, colon);
};

/** The name without its prefix. */
export const localName = (el: XmlElement): string => el.name.slice(el.name.indexOf(":") + 1);

export const childElements = (el: XmlElement): XmlElement[] =>
  el.children.filter((c): c is XmlElement => c.kind === "element");

/** What `prefix` means in `scope`: the innermost declaration wins. */
function lookup(scope: XmlScope, prefix: string): string | undefined {
  for (let s: XmlScope | undefined = scope; s !== undefined; s = s.parent) {
    const ns = s.declared.get(prefix);
    if (ns !== undefined) return ns;
  }
  return undefined;
}

/** The namespace an element is in: its prefix, or the default namespace without one. */
export const namespaceOf = (el: XmlElement): string | undefined =>
  lookup(el.scope, prefixOf(el.name));

/** An attribute without a prefix, by its name. One of another namespace is not it. */
function findAttr(el: XmlElement, name: string): XmlAttr | undefined {
  return el.attrs.find((a) => a.name === name);
}

/** The attributes that are `local` in the namespace `ns`, whatever their prefix. */
function nsAttrs(el: XmlElement, ns: string, local: string): XmlAttr[] {
  return el.attrs.filter((a) => {
    const colon = a.name.indexOf(":");
    if (colon < 0 || a.name.startsWith("xmlns:")) return false;
    return a.name.slice(colon + 1) === local && lookup(el.scope, a.name.slice(0, colon)) === ns;
  });
}

/** The value of an attribute as written in the tag (`getAttr(el, "ns46:label")` is that very name). */
export function getAttr(el: XmlElement, name: string): string | undefined {
  const a = findAttr(el, name);
  return a === undefined ? undefined : decodeXml(a.raw);
}

export function setAttr(el: XmlElement, name: string, value: string): void {
  const raw = encodeXml(value, "attribute");
  const a = findAttr(el, name);
  if (a !== undefined) a.raw = raw;
  else el.attrs.push({ name, raw });
}

export function removeAttr(el: XmlElement, name: string): void {
  el.attrs = el.attrs.filter((a) => a.name !== name);
}

export function getNsAttr(el: XmlElement, ns: string, local: string): string | undefined {
  const a = nsAttrs(el, ns, local)[0];
  return a === undefined ? undefined : decodeXml(a.raw);
}

export function removeNsAttr(el: XmlElement, ns: string, local: string): void {
  const gone = new Set(nsAttrs(el, ns, local));
  el.attrs = el.attrs.filter((a) => !gone.has(a));
}

/**
 * The prefix `ns` has at the root, declaring it there (with `preferred`, or a numbered variant when
 * that prefix means something else) when it has none. The root is where a prefix has to be bound for
 * every element below to use it.
 */
export function ensureNamespace(root: XmlElement, ns: string, preferred: string): string {
  if (root.scope.parent !== undefined) throw new Error("XML: namespaces are declared on the root");
  for (let s: XmlScope | undefined = root.scope; s !== undefined; s = s.parent) {
    for (const [prefix, bound] of s.declared) if (bound === ns && prefix !== "") return prefix;
  }
  let prefix = preferred;
  for (let n = 2; lookup(root.scope, prefix) !== undefined; n++) prefix = `${preferred}${n}`;
  root.attrs.push({ name: `xmlns:${prefix}`, raw: encodeXml(ns, "attribute") });
  // The root's own declarations: the elements below share this scope object (or chain up to it),
  // so they see the new prefix too.
  root.scope.declared.set(prefix, ns);
  return prefix;
}

/**
 * Sets `local` of the namespace `ns` on `el`, replacing the ones there under any prefix. The
 * namespace has to be declared in scope already (`ensureNamespace` on the root).
 */
export function setNsAttr(el: XmlElement, ns: string, local: string, value: string): void {
  let prefix: string | undefined;
  for (
    let s: XmlScope | undefined = el.scope;
    s !== undefined && prefix === undefined;
    s = s.parent
  ) {
    for (const [p, bound] of s.declared) {
      // The prefix has to mean `ns` here, not be shadowed by a nearer declaration.
      if (bound === ns && p !== "" && lookup(el.scope, p) === ns) {
        prefix = p;
        break;
      }
    }
  }
  if (prefix === undefined)
    throw new Error(`XML: namespace ${ns} is not declared — no prefix for ${local}`);
  removeNsAttr(el, ns, local);
  el.attrs.push({ name: `${prefix}:${local}`, raw: encodeXml(value, "attribute") });
}

/**
 * A new element below `parent` (its scope is the parent's). Attribute values and the names are given
 * plainly — the values are escaped here.
 */
export function createElement(
  name: string,
  attrs: [string, string][],
  parent: XmlElement,
  children: XmlNode[] = [],
): XmlElement {
  return {
    kind: "element",
    name,
    attrs: attrs.map(([n, v]) => ({ name: n, raw: encodeXml(v, "attribute") })),
    children,
    scope: parent.scope,
  };
}
