// Shared by /view/sign-in and /view/sign-up (spec 030): resolve the post-auth
// return target from an optional share token, and redirect an already
// signed-in visitor there before rendering the form (both pages otherwise
// duplicated this exact preamble — quality sweep, specs 028-031).
import { redirect } from "next/navigation";
import { getSessionContext } from "../../../lib/auth.js";

export async function resolveClientAuthReturnTo(token: string | undefined, requestHeaders: Headers): Promise<string> {
  const returnTo = token ? `/view/${token}` : "/view";
  const session = await getSessionContext(requestHeaders);
  if (session) {
    redirect(returnTo);
  }
  return returnTo;
}
