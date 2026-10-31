import fs from 'node:fs';
import { Jimp } from 'jimp';
import { sniffImage } from './visitors.js';

const MAX_BYTES = 3_500_000;
const MAX_SIDE = 1568;

// A picture as Claude can see it, as an image block's source. Photos too big
// to send (straight off a phone, say) are shrunk first. Anything that isn't a
// PNG, JPEG, WebP or GIF gives null.
export async function visionImage(fileOrBuffer) {
  let buf;
  try {
    buf = Buffer.isBuffer(fileOrBuffer) ? fileOrBuffer : fs.readFileSync(fileOrBuffer);
  } catch {
    return null;
  }
  const type = sniffImage(buf);
  if (!type) return null;
  if (buf.length <= MAX_BYTES) return { type: 'base64', media_type: type, data: buf.toString('base64') };
  try {
    const img = await Jimp.read(buf);
    img.scaleToFit({ w: MAX_SIDE, h: MAX_SIDE });
    return { type: 'base64', media_type: 'image/jpeg', data: (await img.getBuffer('image/jpeg', { quality: 85 })).toString('base64') };
  } catch {
    return null;
  }
}
