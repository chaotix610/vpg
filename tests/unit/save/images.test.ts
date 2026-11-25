import { describe, expect, it } from "vitest";
import {
  type DecodedImage,
  type ImageCodec,
  fitWithin,
  isUserImageRef,
  libraryName,
  prepareImport,
  referencedImages,
  sha256Hex,
  sniffImage,
  userImageId,
  userImageRef,
} from "@/save/images";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452); // IHDR
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment to skip, then a baseline SOF0 frame header.
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01,
  ]);
}

describe("image references", () => {
  const id = "0".repeat(64);

  it("round-trips an id and rejects malformed references", () => {
    expect(userImageId(userImageRef(id))).toBe(id);
    expect(isUserImageRef("user-image:bad")).toBe(true);
    expect(userImageId("user-image:bad")).toBeNull();
    expect(userImageId("assets/x.png")).toBeNull();
  });

  it("collects the images an arena's texture maps use", () => {
    expect(referencedImages({ arenaTextures: { a: userImageRef(id) }, ringTextures: { b: "assets/x.png" } })).toEqual(new Set([id]));
  });
});

describe("sniffImage", () => {
  it("reads PNG and JPEG dimensions from the bytes", () => {
    expect(sniffImage(png(640, 480))).toEqual({ mime: "image/png", width: 640, height: 480 });
    expect(sniffImage(jpeg(300, 200))).toEqual({ mime: "image/jpeg", width: 300, height: 200 });
  });

  it("refuses other formats and zero sizes", () => {
    expect(sniffImage(new TextEncoder().encode("GIF89a........................"))).toBeNull();
    expect(sniffImage(png(0, 10))).toBeNull();
  });
});

it("fits within the side and pixel limits, keeping the aspect ratio", () => {
  expect(fitWithin(1000, 500)).toEqual({ width: 1000, height: 500 });
  expect(fitWithin(8192, 4096)).toEqual({ width: 2048, height: 1024 });
  expect(fitWithin(4000, 4000, 4096, 1000 * 1000)).toEqual({ width: 1000, height: 1000 });
});

it("names library entries from the file name", () => {
  expect(libraryName("My   Canvas.final.png")).toBe("My Canvas.final");
  expect(libraryName(".png")).toBe("Imported image");
});

describe("prepareImport", () => {
  // Encodes to a PNG header of the requested size, as a browser would.
  const codec: ImageCodec<DecodedImage> = {
    async decode() {
      return { width: 4096, height: 1024, close() {} };
    },
    async encode(_image, width, height) {
      return new Blob([png(width, height).slice().buffer], { type: "image/png" });
    },
  };

  it("re-encodes oversize art to the limits and hashes the stored bytes", async () => {
    const { info } = await prepareImport(new Blob([png(4096, 1024).slice().buffer]), codec);
    expect(info).toMatchObject({ mime: "image/png", width: 2048, height: 512 });
    expect(info.id).toBe(await sha256Hex(png(2048, 512)));
  });

  it("refuses files that are not PNG or JPEG", async () => {
    await expect(prepareImport(new Blob(["hello"]), codec)).rejects.toThrow(/PNG and JPEG/);
  });
});
