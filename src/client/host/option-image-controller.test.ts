import { describe, it, expect, vi } from "vitest";
import type { AssetId } from "../../shared/domain-types";
import type { ApiResult } from "./api-client";
import type { ProcessImageError } from "./choice-image-processor";
import type { Result } from "../../shared/domain-types";
import {
  clearOptionImage,
  optionImageErrorMessage,
  prepareOptionImage,
  setOptionImage,
  type OptionImageDeps,
} from "./option-image-controller";
import type { QuestionFormOption } from "./question-validation";

const asset = (id: string) => id as AssetId;
const png = () => new File([new Uint8Array(8)], "photo.png", { type: "image/png" });
const jpegBlob = () => new Blob([new Uint8Array(4)], { type: "image/jpeg" });

function deps(overrides: Partial<OptionImageDeps> = {}) {
  const process = vi.fn(async (_file: File): Promise<Result<Blob, ProcessImageError>> => ({ ok: true, value: jpegBlob() }));
  const upload = vi.fn(async (_file: File): Promise<ApiResult<{ assetId: AssetId }>> => ({ ok: true, value: { assetId: asset("uploaded") } }));
  return { process, upload, ...overrides } as OptionImageDeps & { process: typeof process; upload: typeof upload };
}

describe("prepareOptionImage", () => {
  it("processes the selected file, uploads the processed JPEG, and returns the new asset id", async () => {
    const d = deps();
    const result = await prepareOptionImage(png(), d);

    expect(result).toEqual({ ok: true, assetId: "uploaded" });
    expect(d.process).toHaveBeenCalledTimes(1);
    const uploaded = d.upload.mock.calls[0]![0];
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.type).toBe("image/jpeg");
    expect(uploaded.name).toBe("option.jpg");
  });

  it.each(["UNSUPPORTED_TYPE", "DECODE_FAILED", "ENCODE_FAILED"] as const)("returns %s without uploading anything when processing fails", async (code) => {
    const d = deps({ process: vi.fn(async () => ({ ok: false, error: { code } }) as const) });
    const result = await prepareOptionImage(png(), d);
    expect(result).toEqual({ ok: false, error: code });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("maps a 413 PAYLOAD_TOO_LARGE rejection to PAYLOAD_TOO_LARGE", async () => {
    const d = deps({ upload: vi.fn(async () => ({ ok: false, status: 413, code: "PAYLOAD_TOO_LARGE" }) as const) });
    expect(await prepareOptionImage(png(), d)).toEqual({ ok: false, error: "PAYLOAD_TOO_LARGE" });
  });

  it("maps an unsupported media type rejection from the server to UNSUPPORTED_TYPE", async () => {
    const d = deps({ upload: vi.fn(async () => ({ ok: false, status: 413, code: "UNSUPPORTED_MEDIA_TYPE" }) as const) });
    expect(await prepareOptionImage(png(), d)).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
  });

  it("maps any other upload failure to UPLOAD_FAILED", async () => {
    const d = deps({ upload: vi.fn(async () => ({ ok: false, status: 0, code: "NETWORK_ERROR" }) as const) });
    expect(await prepareOptionImage(png(), d)).toEqual({ ok: false, error: "UPLOAD_FAILED" });
  });
});

describe("setOptionImage / clearOptionImage", () => {
  const options: readonly QuestionFormOption[] = [
    { label: "A", isCorrect: true, imageAssetId: asset("a") },
    { label: "B", isCorrect: false, imageAssetId: null },
  ];

  it("sets (or replaces) the image of one option and leaves the others and the text untouched", () => {
    const next = setOptionImage(options, 1, asset("b2"));
    expect(next.map((o) => o.imageAssetId)).toEqual([asset("a"), asset("b2")]);
    expect(next.map((o) => o.label)).toEqual(["A", "B"]);
    expect(setOptionImage(options, 0, asset("a2"))[0]!.imageAssetId).toBe("a2");
  });

  it("removes the image of one option, keeping its text and correctness", () => {
    const next = clearOptionImage(options, 0);
    expect(next[0]).toEqual({ label: "A", isCorrect: true, imageAssetId: null });
    expect(next[1]).toBe(options[1]);
  });

  it("does not mutate the original options and ignores an out-of-range index", () => {
    const before = JSON.stringify(options);
    setOptionImage(options, 0, asset("x"));
    clearOptionImage(options, 0);
    expect(JSON.stringify(options)).toBe(before);
    expect(setOptionImage(options, 9, asset("x"))).toEqual(options);
    expect(clearOptionImage(options, -1)).toEqual(options);
  });
});

describe("optionImageErrorMessage", () => {
  it("explains each failure in Japanese, naming the allowed formats for unsupported files", () => {
    expect(optionImageErrorMessage("UNSUPPORTED_TYPE")).toContain("JPEG");
    expect(optionImageErrorMessage("UNSUPPORTED_TYPE")).toContain("PNG");
    expect(optionImageErrorMessage("UNSUPPORTED_TYPE")).toContain("WebP");
    expect(optionImageErrorMessage("DECODE_FAILED")).toContain("読み込");
    expect(optionImageErrorMessage("ENCODE_FAILED")).toContain("加工");
    expect(optionImageErrorMessage("PAYLOAD_TOO_LARGE")).toContain("サイズ");
    expect(optionImageErrorMessage("UPLOAD_FAILED")).toContain("アップロード");
  });
});
