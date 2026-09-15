/**
 * Edge flood-fill: remove near-black background, keep symbol inside white oval.
 * Dark-grey wordmark is whitened for dark UI surfaces.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/c-Users-Farrukh-jaffer-brother-group-it/assets",
    "C__Users_Farrukh_.cursor_projects_c-Users-Farrukh-jaffer-brother-group-it_assets_c__Users_Farrukh_AppData_Roaming_Cursor_User_workspaceStorage_8273f5bfa2a3ef238be8c1e6f2f0de17_images_4_2-899caa58-f477-4f2a-8d06-de72afdce8f3.png"
  );

const OUT_DIR = path.join(__dirname, "..", "public", "assets");

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Source not found:", SRC);
    process.exit(1);
  }

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { width, height, channels } = info;
  console.log({ width, height, channels, src: SRC });

  const px = (i) => i * channels;
  const isBg = (i) => {
    const o = px(i);
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (a < 8) return true;
    // Near-black only — wordmark ~#222 stays opaque
    return r <= 18 && g <= 18 && b <= 18;
  };

  const visited = new Uint8Array(width * height);
  const q = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (visited[i]) return;
    if (!isBg(i)) return;
    visited[i] = 1;
    q.push(i);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (q.length) {
    const i = q.pop();
    data[px(i) + 3] = 0;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }

  let minY = height;
  let maxY = 0;
  let minX = width;
  let maxX = 0;
  let whiteCount = 0;
  for (let i = 0; i < width * height; i++) {
    const o = px(i);
    if (data[o + 3] < 200) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (r > 220 && g > 220 && b > 220) {
      whiteCount++;
      const x = i % width;
      const y = (i / width) | 0;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  console.log({ whiteCount, oval: { minX, maxX, minY, maxY } });

  const wordmarkTop = maxY + Math.max(4, Math.round(height * 0.01));
  let whitened = 0;
  let keptBlack = 0;
  for (let i = 0; i < width * height; i++) {
    const o = px(i);
    if (data[o + 3] < 200) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    if (lum > 90 || maxc - minc > 40) continue;
    const y = (i / width) | 0;
    if (y >= wordmarkTop) {
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      whitened++;
    } else {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      keptBlack++;
    }
  }
  console.log({ whitened, keptBlack, wordmarkTop });

  let tminX = width;
  let tmaxX = 0;
  let tminY = height;
  let tmaxY = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[px(i) + 3] < 16) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (x < tminX) tminX = x;
    if (x > tmaxX) tmaxX = x;
    if (y < tminY) tminY = y;
    if (y > tmaxY) tmaxY = y;
  }
  const pad = 8;
  tminX = Math.max(0, tminX - pad);
  tminY = Math.max(0, tminY - pad);
  tmaxX = Math.min(width - 1, tmaxX + pad);
  tmaxY = Math.min(height - 1, tmaxY + pad);
  const tw = tmaxX - tminX + 1;
  const th = tmaxY - tminY + 1;
  const cropped = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = ((tminY + y) * width + (tminX + x)) * 4;
      const di = (y * tw + x) * 4;
      cropped[di] = data[si];
      cropped[di + 1] = data[si + 1];
      cropped[di + 2] = data[si + 2];
      cropped[di + 3] = data[si + 3];
    }
  }

  const png = await sharp(cropped, {
    raw: { width: tw, height: th, channels: 4 },
  })
    .png()
    .toBuffer();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "jaffer-logo.png"), png);
  fs.writeFileSync(path.join(OUT_DIR, "jaffer-logo-lockup.png"), png);
  fs.writeFileSync(path.join(OUT_DIR, "jaffer-logo-emblem.png"), png);

  const markBottom = Math.min(th - 1, wordmarkTop - tminY + pad);
  const markH = Math.max(1, markBottom);
  const markBuf = Buffer.alloc(tw * markH * 4);
  for (let y = 0; y < markH; y++) {
    cropped.copy(markBuf, y * tw * 4, y * tw * 4, (y + 1) * tw * 4);
  }

  let mminX = tw;
  let mmaxX = 0;
  let mminY = markH;
  let mmaxY = 0;
  for (let i = 0; i < tw * markH; i++) {
    if (markBuf[i * 4 + 3] < 16) continue;
    const x = i % tw;
    const y = (i / tw) | 0;
    if (x < mminX) mminX = x;
    if (x > mmaxX) mmaxX = x;
    if (y < mminY) mminY = y;
    if (y > mmaxY) mmaxY = y;
  }
  const mp = 6;
  mminX = Math.max(0, mminX - mp);
  mminY = Math.max(0, mminY - mp);
  mmaxX = Math.min(tw - 1, mmaxX + mp);
  mmaxY = Math.min(markH - 1, mmaxY + mp);
  const mw = mmaxX - mminX + 1;
  const mh = mmaxY - mminY + 1;
  const markCrop = Buffer.alloc(mw * mh * 4);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const si = ((mminY + y) * tw + (mminX + x)) * 4;
      const di = (y * mw + x) * 4;
      markCrop[di] = markBuf[si];
      markCrop[di + 1] = markBuf[si + 1];
      markCrop[di + 2] = markBuf[si + 2];
      markCrop[di + 3] = markBuf[si + 3];
    }
  }
  const markPng = await sharp(markCrop, {
    raw: { width: mw, height: mh, channels: 4 },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, "jaffer-logo-mark.png"), markPng);

  console.log(
    "Wrote lockup",
    `${tw}x${th}`,
    png.length,
    "mark",
    `${mw}x${mh}`,
    markPng.length
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
