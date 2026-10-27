declare module "pdf-parse" {
  export default function pdfParse(
    data: Buffer | string,
    options?: { password?: string; version?: number }
  ): Promise<{ NumPages: number; text: string; metadata: unknown }>;
}
