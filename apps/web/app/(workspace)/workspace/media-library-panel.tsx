// Agency media library (spec 015 US1; spec 027 US1: real file upload,
// seed-0022a) — register licensed media OR upload a local file, and see it
// listed, ready to attach to any itinerary. Presentation rides the
// seed-0009s theme kit (.tf-*); every user-visible failure string comes from
// the pure helpers in lib/media-library.ts.
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { trpc, type MediaAsset, type RegisterMediaInput, type UploadMediaInput } from "../../../lib/trpc/client.js";
import {
  mediaKindLabel,
  mediaSourceLabel,
  listMediaErrorMessage,
  registerMediaErrorMessage,
  uploadMediaErrorMessage,
  uploadMediaRefusalMessage,
} from "../../../lib/media-library.js";
import { MediaThumbImage } from "../../components/media-thumb-image.js";

type ListState =
  | { phase: "loading" }
  | { phase: "loaded"; assets: MediaAsset[] }
  | { phase: "failed"; message: string };

const INITIAL_FORM: RegisterMediaInput = {
  source: "agent-upload",
  kind: "image",
  url: "",
  alt: "",
};

const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Browser-side ArrayBuffer → base64 (spec 027 research D2) — no `Buffer` in
 * the browser, so this is the standard btoa/String.fromCharCode pattern. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Loads and renders the caller's own agency library (INV-004, tenant-scoped
 * server-side). `onChanged` lets a sibling panel (the opened trip's attach
 * picker) know a fresh item is available without polling. */
export function MediaLibraryPanel({ onChanged }: { onChanged?: () => void } = {}) {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [form, setForm] = useState<RegisterMediaInput>(INITIAL_FORM);
  const [registering, setRegistering] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [uploadSource, setUploadSource] = useState<UploadMediaInput["source"]>("agent-upload");
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function loadLibrary() {
    try {
      const outcome = await trpc.workspace.media.list.query();
      setList({ phase: "loaded", assets: outcome.assets });
    } catch (error) {
      setList({ phase: "failed", message: listMediaErrorMessage(error) });
    }
  }

  useEffect(() => {
    void loadLibrary();
  }, []);

  function update<K extends keyof RegisterMediaInput>(field: K, value: RegisterMediaInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registering) return;
    setRegistering(true);
    setFormError(null);
    try {
      const outcome = await trpc.workspace.media.register.mutate(form);
      if (outcome.status === "registered") {
        setForm(INITIAL_FORM);
        await loadLibrary();
        onChanged?.();
      } else {
        setFormError("That source isn't allowed. Pick one of the listed options.");
      }
    } catch (error) {
      setFormError(registerMediaErrorMessage(error));
    } finally {
      setRegistering(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading || !uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      if (uploadFile.size > MAX_UPLOAD_BYTES) {
        setUploadError(uploadMediaRefusalMessage("file_too_large"));
        return;
      }
      const dataBase64 = await fileToBase64(uploadFile);
      const outcome = await trpc.workspace.media.upload.mutate({
        source: uploadSource,
        kind: "image",
        mimeType: uploadFile.type as UploadMediaInput["mimeType"],
        dataBase64,
        alt: uploadAlt,
      });
      if (outcome.status === "uploaded") {
        setUploadAlt("");
        setUploadFile(null);
        setUploadInputKey((key) => key + 1);
        await loadLibrary();
        onChanged?.();
      } else {
        setUploadError(uploadMediaRefusalMessage(outcome.reason));
      }
    } catch (error) {
      setUploadError(uploadMediaErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="tf-card tf-medialib" data-testid="media-library-panel">
      <p className="tf-eyebrow">Content library</p>
      <h2>Your media</h2>
      <form onSubmit={handleSubmit} className="tf-planner-form" data-testid="media-register-form">
        <label htmlFor="media-source">
          Source
          <select
            id="media-source"
            value={form.source}
            onChange={(event) => update("source", event.target.value as RegisterMediaInput["source"])}
          >
            <option value="agent-upload">Your upload</option>
            <option value="licensed-stock">Licensed stock</option>
            <option value="official-embed">Official embed</option>
            <option value="traveler-ugc">Traveler photo</option>
          </select>
        </label>
        <label htmlFor="media-kind">
          Kind
          <select
            id="media-kind"
            value={form.kind}
            onChange={(event) => update("kind", event.target.value as RegisterMediaInput["kind"])}
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="embed">Embed</option>
          </select>
        </label>
        <label htmlFor="media-url" className="span-2">
          Media URL
          <input
            id="media-url"
            type="url"
            required
            placeholder="https://…"
            value={form.url}
            onChange={(event) => update("url", event.target.value)}
          />
        </label>
        <label htmlFor="media-alt" className="span-2">
          Alt text
          <input
            id="media-alt"
            type="text"
            required
            placeholder="Describe the photo"
            value={form.alt}
            onChange={(event) => update("alt", event.target.value)}
          />
        </label>
        <button type="submit" className="tf-btn--cta" disabled={registering} data-testid="media-register-submit">
          {registering ? "Adding…" : "Add to library"}
        </button>
      </form>
      {formError ? <p role="alert">{formError}</p> : null}

      <form onSubmit={handleUpload} className="tf-planner-form" data-testid="media-upload-form">
        <label htmlFor="media-upload-source">
          Source
          <select
            id="media-upload-source"
            value={uploadSource}
            onChange={(event) => setUploadSource(event.target.value as UploadMediaInput["source"])}
          >
            <option value="agent-upload">Your upload</option>
            <option value="traveler-ugc">Traveler photo</option>
          </select>
        </label>
        <label htmlFor="media-upload-file" className="span-2">
          Upload a photo from your device
          <input
            id="media-upload-file"
            key={uploadInputKey}
            type="file"
            accept={UPLOAD_ACCEPT}
            required
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            data-testid="media-upload-file"
          />
        </label>
        <label htmlFor="media-upload-alt" className="span-2">
          Alt text
          <input
            id="media-upload-alt"
            type="text"
            required
            placeholder="Describe the photo"
            value={uploadAlt}
            onChange={(event) => setUploadAlt(event.target.value)}
          />
        </label>
        <button type="submit" className="tf-btn--cta" disabled={uploading} data-testid="media-upload-submit">
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
      </form>
      {uploadError ? <p role="alert">{uploadError}</p> : null}

      {list.phase === "loading" ? (
        <p className="tf-trip-note" aria-live="polite">
          Loading your media…
        </p>
      ) : null}
      {list.phase === "failed" ? <p role="alert">{list.message}</p> : null}
      {list.phase === "loaded" && list.assets.length === 0 ? (
        <p className="tf-empty-day" data-testid="media-empty">
          No media yet. Add a licensed photo above to start building a picture-led proposal.
        </p>
      ) : null}
      {list.phase === "loaded" && list.assets.length > 0 ? (
        <ul className="tf-media-grid" data-testid="media-list">
          {list.assets.map((asset) => (
            <li key={asset.id} className="tf-media-card" data-testid="media-card">
              {asset.kind === "image" ? (
                <MediaThumbImage src={asset.url} alt={asset.alt} />
              ) : (
                <a href={asset.url} target="_blank" rel="noreferrer" className="tf-media-thumb tf-media-thumb--link">
                  ▶ {mediaKindLabel(asset.kind)}
                </a>
              )}
              <span className="tf-badge">{mediaSourceLabel(asset.source)}</span>
              <span className="tf-media-alt">{asset.alt}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
