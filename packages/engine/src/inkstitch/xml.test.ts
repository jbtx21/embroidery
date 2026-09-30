import { describe, expect, it } from "vitest";
import {
  childElements,
  createElement,
  decodeXml,
  encodeXml,
  ensureNamespace,
  getAttr,
  getNsAttr,
  localName,
  namespaceOf,
  parseXml,
  removeAttr,
  removeNsAttr,
  serializeNode,
  serializeXml,
  setAttr,
  setNsAttr,
  XML_NS,
} from "./xml.js";
import type { XmlElement } from "./xml.js";

/** What Ink/Stitch (inkex, lxml) writes: a prefix re-bound in nested scopes, namespace declarations on the element. */
const INKEX = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" width="10mm" height="5mm" viewBox="0 0 10 5"><defs><symbol id="s"><title id="t">Trim &amp; go</title></symbol></defs><ns0:namedview xmlns:ns0="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/><g id="a"><path xmlns:ns46="http://www.inkscape.org/namespaces/inkscape" id="p" d="M 0 0 L 1 1" style="fill:none;stroke:#d1b35a" inkstitch:satin_column="true" ns46:label="AutoSatin 1"/><g xmlns:ns1="http://www.inkscape.org/namespaces/inkscape" id="c" ns1:label="Command"><use xmlns:ns1="http://www.w3.org/1999/xlink" id="u" ns1:href="#inkstitch_trim"/></g></g></svg>`;

const root = (text: string): XmlElement => parseXml(text).root;
const child = (el: XmlElement, name: string): XmlElement =>
  childElements(el).find((c) => getAttr(c, "id") === name || c.name === name)!;

describe("parseXml / serializeXml", () => {
  it("reads elements, attributes and text, and writes them back as they were", () => {
    expect(serializeXml(parseXml(INKEX))).toBe(INKEX);
  });

  it("keeps the prolog, the epilog, comments, CDATA and processing instructions", () => {
    const text =
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- vor der Wurzel -->\n` +
      `<svg xmlns="http://www.w3.org/2000/svg"><!-- Kommentar --><style><![CDATA[a > b { x: 1 }]]></style>` +
      `<?pi data?><g>\n  <path d="M 0 0"/>\n</g></svg>\n<!-- danach -->\n`;
    expect(serializeXml(parseXml(text))).toBe(text);
    expect(parseXml(text).prolog).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- vor der Wurzel -->\n`,
    );
    expect(parseXml(text).epilog).toBe(`\n<!-- danach -->\n`);
  });

  it("finds the end of a tag past a > inside an attribute value", () => {
    const r = root(
      `<svg xmlns="http://www.w3.org/2000/svg"><path id="a" d="M 0 0" data-x="1 > 0"/></svg>`,
    );
    expect(getAttr(child(r, "a"), "data-x")).toBe("1 > 0");
  });

  it("reads single-quoted values and writes them double-quoted without changing what they say", () => {
    const r = root(`<svg xmlns="http://www.w3.org/2000/svg" a='x "y" z'/>`);
    expect(getAttr(r, "a")).toBe('x "y" z');
    expect(serializeXml({ prolog: "", root: r, epilog: "" })).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" a="x &quot;y&quot; z"/>`,
    );
  });

  it("skips a byte-order mark", () => {
    expect(root(`\uFEFF<svg xmlns="http://www.w3.org/2000/svg"/>`).name).toBe("svg");
  });

  it("reads a DOCTYPE with an internal subset into the prolog", () => {
    const text = `<!DOCTYPE svg [ <!ENTITY x "1>2"> ]>\n<svg xmlns="http://www.w3.org/2000/svg"/>`;
    const doc = parseXml(text);
    expect(doc.prolog).toBe(`<!DOCTYPE svg [ <!ENTITY x "1>2"> ]>\n`);
    expect(serializeXml(doc)).toBe(text);
  });

  it("refuses what is not well-formed instead of guessing", () => {
    expect(() => parseXml("<svg><g></svg>")).toThrow("</svg> does not close <g>");
    expect(() => parseXml("<svg>")).toThrow("<svg> is not closed");
    expect(() => parseXml("</svg>")).toThrow("</svg> without a start tag");
    expect(() => parseXml("kein xml")).toThrow("text outside the root element");
    expect(() => parseXml("")).toThrow("no root element");
    expect(() => parseXml("<svg/><svg/>")).toThrow("second root element <svg>");
    expect(() => parseXml('<svg a="1/>')).toThrow("attribute a of <svg>");
    expect(() => parseXml("<svg a/>")).toThrow("attribute a of <svg>");
    expect(() => parseXml("<!-- offen")).toThrow("comment is not closed");
  });

  it("writes an element with children it got after parsing in full, an emptied one self-closed", () => {
    const r = root(`<svg xmlns="http://www.w3.org/2000/svg"><g id="x"/></svg>`);
    const g = child(r, "x");
    g.children.push(createElement("path", [["d", "M 0 0"]], r));
    expect(serializeNode(g)).toBe(`<g id="x"><path d="M 0 0"/></g>`);
    g.children.length = 0;
    expect(serializeNode(g)).toBe(`<g id="x"/>`);
  });
});

describe("namespaces", () => {
  it("resolves a prefix in the scope of its element — the same prefix can mean two namespaces", () => {
    const r = root(INKEX);
    const group = child(child(r, "a"), "c");
    expect(getNsAttr(group, XML_NS.inkscape, "label")).toBe("Command");
    const use = child(group, "u");
    // In the <use>, ns1 is the xlink namespace; the label of the group above is not its attribute.
    expect(getNsAttr(use, XML_NS.xlink, "href")).toBe("#inkstitch_trim");
    expect(getNsAttr(use, XML_NS.inkscape, "href")).toBeUndefined();
  });

  it("finds an Ink/Stitch attribute under whatever prefix the file chose", () => {
    const path = child(child(root(INKEX), "a"), "p");
    expect(getNsAttr(path, XML_NS.inkstitch, "satin_column")).toBe("true");
    expect(getNsAttr(path, XML_NS.inkscape, "label")).toBe("AutoSatin 1");
  });

  it("names the namespace of an element", () => {
    const r = root(INKEX);
    expect(namespaceOf(r)).toBe(XML_NS.svg);
    expect(namespaceOf(child(r, "ns0:namedview"))).toBe(XML_NS.sodipodi);
    expect(localName(child(r, "ns0:namedview"))).toBe("namedview");
    expect(localName(r)).toBe("svg");
  });

  it("replaces an attribute of a namespace whatever its prefix, and keeps the others", () => {
    const r = root(INKEX);
    const prefix = ensureNamespace(r, XML_NS.inkscape, "inkscape");
    expect(prefix).toBe("inkscape");
    const path = child(child(r, "a"), "p");
    setNsAttr(path, XML_NS.inkscape, "label", "Satin · Gold · a");
    // The old one is gone; the new one takes the prefix the element itself declared for the namespace.
    expect(path.attrs.filter((a) => a.name.endsWith(":label"))).toEqual([
      { name: "ns46:label", raw: "Satin · Gold · a" },
    ]);
    expect(getNsAttr(path, XML_NS.inkscape, "label")).toBe("Satin · Gold · a");
    expect(getNsAttr(path, XML_NS.inkstitch, "satin_column")).toBe("true");
    expect(getAttr(path, "d")).toBe("M 0 0 L 1 1");
  });

  it("takes the prefix of the root for an element that declares none", () => {
    const r = root(INKEX);
    ensureNamespace(r, XML_NS.inkscape, "inkscape");
    const group = child(r, "a");
    setNsAttr(group, XML_NS.inkscape, "label", "Satin");
    expect(group.attrs).toContainEqual({ name: "inkscape:label", raw: "Satin" });
  });

  it("does not take a prefix that a nearer declaration has given to another namespace", () => {
    const r = root(INKEX);
    ensureNamespace(r, XML_NS.inkscape, "inkscape");
    // Below the group `c`, ns1 is xlink's; the only prefix that still means Inkscape is the root's.
    const use = child(child(child(r, "a"), "c"), "u");
    setNsAttr(use, XML_NS.inkscape, "label", "Marke");
    expect(use.attrs).toContainEqual({ name: "inkscape:label", raw: "Marke" });
  });

  it("re-uses a prefix the root already has for a namespace", () => {
    const r = root(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:ink="${XML_NS.inkscape}"/>`);
    expect(ensureNamespace(r, XML_NS.inkscape, "inkscape")).toBe("ink");
    expect(r.attrs).toHaveLength(2);
  });

  it("does not take a preferred prefix that means something else", () => {
    const r = root(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://example.org/x"/>`,
    );
    const prefix = ensureNamespace(r, XML_NS.inkscape, "inkscape");
    expect(prefix).not.toBe("inkscape");
    expect(r.attrs.map((a) => a.name)).toContain(`xmlns:${prefix}`);
  });

  it("declares a namespace on the root, where every element below sees it", () => {
    const r = root(INKEX);
    expect(getNsAttr(child(r, "a"), XML_NS.inkscape, "groupmode")).toBeUndefined();
    ensureNamespace(r, XML_NS.inkscape, "inkscape");
    const g = createElement("g", [], r);
    setNsAttr(g, XML_NS.inkscape, "groupmode", "layer");
    r.children.push(g);
    expect(serializeNode(g)).toBe(`<g inkscape:groupmode="layer"/>`);
    expect(r.attrs.find((a) => a.name === "xmlns:inkscape")?.raw).toBe(XML_NS.inkscape);
    // And the text round-trips: the prefix is bound at the root now.
    const again = parseXml(serializeXml({ prolog: "", root: r, epilog: "" }));
    const layer = childElements(again.root).find((c) => c.name === "g" && !getAttr(c, "id"))!;
    expect(getNsAttr(layer, XML_NS.inkscape, "groupmode")).toBe("layer");
  });

  it("refuses to set an attribute of a namespace nothing has declared", () => {
    const r = root(INKEX);
    expect(() => setNsAttr(r, XML_NS.inkscape, "label", "x")).toThrow(/inkscape/);
  });

  it("removes an attribute of a namespace", () => {
    const path = child(child(root(INKEX), "a"), "p");
    removeNsAttr(path, XML_NS.inkscape, "label");
    expect(getNsAttr(path, XML_NS.inkscape, "label")).toBeUndefined();
    expect(getNsAttr(path, XML_NS.inkstitch, "satin_column")).toBe("true");
  });
});

describe("attributes", () => {
  it("reads, sets and removes a plain attribute", () => {
    const r = root(`<svg xmlns="http://www.w3.org/2000/svg" width="10mm"/>`);
    expect(getAttr(r, "width")).toBe("10mm");
    expect(getAttr(r, "height")).toBeUndefined();
    setAttr(r, "width", "20mm");
    setAttr(r, "height", "5mm");
    expect(r.attrs.map((a) => [a.name, a.raw])).toEqual([
      ["xmlns", XML_NS.svg],
      ["width", "20mm"],
      ["height", "5mm"],
    ]);
    removeAttr(r, "width");
    expect(getAttr(r, "width")).toBeUndefined();
  });

  it("does not take an attribute of another namespace for a plain one", () => {
    const path = child(child(root(INKEX), "a"), "p");
    expect(getAttr(path, "label")).toBeUndefined();
    expect(getAttr(path, "ns46:label")).toBe("AutoSatin 1");
  });

  it("decodes what it reads and encodes what it writes", () => {
    const r = root(
      `<svg xmlns="http://www.w3.org/2000/svg" a="x &amp; &lt;y&gt; &quot;z&quot; &#65;&#x42;"/>`,
    );
    expect(getAttr(r, "a")).toBe('x & <y> "z" AB');
    setAttr(r, "a", 'Tom & "Jerry" <1>\n');
    expect(r.attrs.find((a) => a.name === "a")!.raw).toBe(
      "Tom &amp; &quot;Jerry&quot; &lt;1>&#10;",
    );
    expect(getAttr(r, "a")).toBe('Tom & "Jerry" <1>\n');
  });
});

describe("decodeXml / encodeXml", () => {
  it("decodes the five entities and numeric references, and leaves an unknown one alone", () => {
    expect(decodeXml("&lt;&gt;&amp;&quot;&apos;")).toBe(`<>&"'`);
    expect(decodeXml("&#960; &#x3C0;")).toBe("π π");
    expect(decodeXml("&nbsp; &amp;amp;")).toBe("&nbsp; &amp;");
  });

  it("encodes attribute values and text for what each may hold", () => {
    expect(encodeXml(`a&b<c>"d"`, "attribute")).toBe("a&amp;b&lt;c>&quot;d&quot;");
    expect(encodeXml(`a&b<c>"d"`, "text")).toBe(`a&amp;b&lt;c&gt;"d"`);
    expect(encodeXml("Prüfstellen · Weiß", "attribute")).toBe("Prüfstellen · Weiß");
  });
});

describe("createElement", () => {
  it("makes an element that shares the scope of its parent", () => {
    const r = root(INKEX);
    const g = createElement("g", [["id", "neu"]], r);
    expect(namespaceOf(g)).toBe(XML_NS.svg);
    expect(g.attrs).toEqual([{ name: "id", raw: "neu" }]);
  });

  it("encodes the values it is given", () => {
    const r = root(INKEX);
    const t = createElement("text", [["data-a", "x<y"]], r, [{ kind: "text", raw: "1 &amp; 2" }]);
    expect(serializeNode(t)).toBe(`<text data-a="x&lt;y">1 &amp; 2</text>`);
  });
});
