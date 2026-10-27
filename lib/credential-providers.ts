/**
 * The providers a user can paste an API key for.
 */

export type CredentialProvider =
  | "gemini"
  | "openai"
  | "replicate"
  | "fal";

export const CREDENTIAL_PROVIDERS = [
  "gemini",
  "openai",
  "replicate",
  "fal",
] as const;

export function isCredentialProvider(value: string): value is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}
