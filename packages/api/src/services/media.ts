// Agency media library (spec 015: content library v0; spec 027: real upload,
// seed-0022a). Thin, tenant-scoped wrappers over `container.mediaStore` — the
// caller's own agencyId is always derived from the verified session
// (AgentSessionContext), never accepted from the client (INV-004).
import type {
  MediaAsset,
  RegisterMediaInput,
  RegisterMediaOutcome,
  UploadMediaInput,
  UploadMediaOutcome,
} from "@tripforge/supply-adapter";
import type { AgentSessionContext, Container } from "../context.js";

export type RegisterMediaServiceInput = Omit<RegisterMediaInput, "agencyId">;

export async function registerMedia(
  container: Container,
  session: AgentSessionContext,
  input: RegisterMediaServiceInput,
): Promise<RegisterMediaOutcome> {
  return container.mediaStore.register({ ...input, agencyId: session.agencyId });
}

export type UploadMediaServiceInput = Omit<UploadMediaInput, "agencyId">;

export async function uploadMedia(
  container: Container,
  session: AgentSessionContext,
  input: UploadMediaServiceInput,
): Promise<UploadMediaOutcome> {
  return container.mediaStore.upload({ ...input, agencyId: session.agencyId });
}

export async function listMedia(
  container: Container,
  session: AgentSessionContext,
): Promise<{ assets: MediaAsset[] }> {
  const assets = await container.mediaStore.list(session.agencyId);
  return { assets };
}

export type GetMediaOutcome = { status: "found"; asset: MediaAsset } | { status: "not_found" };

export async function getMedia(
  container: Container,
  session: AgentSessionContext,
  mediaAssetId: string,
): Promise<GetMediaOutcome> {
  const asset = await container.mediaStore.get(session.agencyId, mediaAssetId);
  return asset ? { status: "found", asset } : { status: "not_found" };
}
