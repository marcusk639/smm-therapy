export type ScrapedPage = {
  url: string;
  title: string;
  html: string;
  scrapedAt: Date;
};

export type ParsedBlock = {
  content: string;
  title: string;
  sourceUrl: string;
};

export type ScrapeOptions = {
  baseUrl: string;
  email?: string;
  password?: string;
  maxPages?: number;
  outputDir?: string;
  statePath?: string;
};

export type ExportOptions = {
  outputDir: string;
  format: "ig-posts" | "json";
};
