export type EnvMap = Record<string, string>;

export function parseEnvFile(content: string): EnvMap {
  const result: EnvMap = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const rawVal = line.slice(eqIdx + 1);
    const value = rawVal.split(" #")[0].trim();
    if (key) result[key] = value;
  }
  return result;
}

export function mergeEnv(existing: EnvMap, incoming: EnvMap): EnvMap {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  return merged;
}

export function serializeEnv(env: EnvMap): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
}

export function getEnvValue(env: EnvMap, key: string): string | undefined {
  const val = env[key];
  return val !== undefined && val.length > 0 ? val : undefined;
}
