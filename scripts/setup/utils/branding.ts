export const BRANDING_PLACEHOLDER = "TherapyContent";

export function replaceBranding(content: string, brandName: string): string {
  return content.split(BRANDING_PLACEHOLDER).join(brandName);
}

export function findBrandingOccurrences(content: string): number {
  return content.split(BRANDING_PLACEHOLDER).length - 1;
}
