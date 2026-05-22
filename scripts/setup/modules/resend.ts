export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: number;
}

export interface ResendDomainResult {
  domainId: string;
  dnsRecords: DnsRecord[];
}

export interface ResendModuleOptions {
  apiKey: string;
  domain: string;
}

export async function setupResendDomain(
  opts: ResendModuleOptions,
): Promise<ResendDomainResult> {
  const response = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: opts.domain }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    id: string;
    records: DnsRecord[];
  };

  return { domainId: data.id, dnsRecords: data.records ?? [] };
}

export function formatDnsRecords(records: DnsRecord[]): string {
  if (records.length === 0) return "  (no records returned)";
  return records
    .map((r) => `  ${r.type.padEnd(6)} ${r.name.padEnd(50)} ${r.value}`)
    .join("\n");
}
