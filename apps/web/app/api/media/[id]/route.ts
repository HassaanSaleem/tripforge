// GET /api/media/[id] — public, unauthenticated byte-serving route for
// upload-backed media assets (spec 027 contracts §2, seed-0022a). Addressed
// only by the asset's own unguessable random uuid: no session is read,
// possession of the id is the read grant — the same trust model the
// client-view share link already uses for the whole itinerary (research D3).
// 404 covers both an unknown id AND a URL-registered asset (nothing stored
// to serve — those render via their own external `url`, never this route).
import { getContainer } from "../../../../lib/trpc/server.js";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return new Response(null, { status: 404 });
  }

  const bytes = await getContainer().mediaStore.getBytesById(id);
  if (!bytes) {
    return new Response(null, { status: 404 });
  }

  return new Response(Buffer.from(bytes.data), {
    status: 200,
    headers: {
      "Content-Type": bytes.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
