// Minimal ZIP reader for tests: returns one entry as text, read through the central directory (handles data descriptors).
import zlib from "node:zlib";
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), nlen = buf.readUInt16LE(off + 28), xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), local = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out[name] = () => (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    off += 46 + nlen + xlen + clen;
  }
  return out;
}
export const zipText = (buf, name) => { const e = zipEntries(buf)[name]; if (!e) throw new Error(`no ${name} in zip`); return e(); };
