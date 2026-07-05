// Typed environment reader (clean-arch skill: "non-secret config in typed config
// modules. No hardcoded endpoints"). Throws early on a missing required var so a
// misconfigured boot fails loudly instead of at first use.

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  return value === undefined || value === "" ? fallback : value;
}
