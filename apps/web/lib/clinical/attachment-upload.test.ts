import { describe, it, expect, vi } from "vitest";
import {
  uploadAttachmentBlob,
  type AttachmentUploadDeps,
} from "./attachment-upload";

// W4-05 — the shared attachment-upload orchestration used by BOTH the file
// picker and the in-page camera capture. These pin that a captured blob flows
// through the exact 3-step signed-URL path (sign -> direct-to-Storage upload ->
// confirm+audit), that blob.size is recorded, and that a failure at any step
// short-circuits without proceeding.

const OK_SLOT = { ok: true as const, path: "tenantA/rec-1/uuid__foto.jpg", token: "tok" };

function makeDeps(over: Partial<AttachmentUploadDeps> = {}) {
  const createUploadUrl = vi.fn().mockResolvedValue(OK_SLOT);
  const uploadToStorage = vi.fn().mockResolvedValue({ error: null });
  const confirmAttachment = vi.fn().mockResolvedValue({ ok: true });
  return {
    deps: { createUploadUrl, uploadToStorage, confirmAttachment, ...over } as AttachmentUploadDeps,
    createUploadUrl,
    uploadToStorage,
    confirmAttachment,
  };
}

const photo = () =>
  new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }); // size 4

describe("uploadAttachmentBlob — happy path (a camera-captured still lands in anexos)", () => {
  it("signs, uploads the blob direct to Storage, then confirms with size + mime", async () => {
    const { deps, createUploadUrl, uploadToStorage, confirmAttachment } = makeDeps();
    const blob = photo();

    const out = await uploadAttachmentBlob("rec-1", blob, "foto-123.jpg", "image/jpeg", deps);

    expect(out).toEqual({ ok: true });
    expect(createUploadUrl).toHaveBeenCalledWith("rec-1", "foto-123.jpg");
    expect(uploadToStorage).toHaveBeenCalledWith(OK_SLOT.path, OK_SLOT.token, blob);
    expect(confirmAttachment).toHaveBeenCalledWith({
      recordId: "rec-1",
      path: OK_SLOT.path,
      fileName: "foto-123.jpg",
      mimeType: "image/jpeg",
      sizeBytes: blob.size, // 4
    });
  });
});

describe("uploadAttachmentBlob — failures short-circuit", () => {
  it("stops at sign when the signed URL cannot be issued", async () => {
    const { deps, uploadToStorage, confirmAttachment } = makeDeps({
      createUploadUrl: vi.fn().mockResolvedValue({ ok: false }),
    });
    const out = await uploadAttachmentBlob("rec-1", photo(), "foto.jpg", "image/jpeg", deps);
    expect(out).toEqual({ ok: false, step: "sign" });
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(confirmAttachment).not.toHaveBeenCalled();
  });

  it("stops at upload when Storage returns an error", async () => {
    const { deps, confirmAttachment } = makeDeps({
      uploadToStorage: vi.fn().mockResolvedValue({ error: new Error("storage down") }),
    });
    const out = await uploadAttachmentBlob("rec-1", photo(), "foto.jpg", "image/jpeg", deps);
    expect(out).toEqual({ ok: false, step: "upload" });
    expect(confirmAttachment).not.toHaveBeenCalled();
  });

  it("reports confirm failure", async () => {
    const { deps } = makeDeps({
      confirmAttachment: vi.fn().mockResolvedValue({ ok: false }),
    });
    const out = await uploadAttachmentBlob("rec-1", photo(), "foto.jpg", "image/jpeg", deps);
    expect(out).toEqual({ ok: false, step: "confirm" });
  });
});
