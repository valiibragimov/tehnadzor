import createClient from "openapi-fetch";
import type { paths, components } from "../../../shared/api-schema.js";
import { API_ROUTES } from "./routes.js";

export type ReportRequest = components["schemas"]["ReportRequest"];

/** The transport is replaceable; feature code does not construct URLs or decode HTTP bodies. */
export function createReportApi(baseUrl: string, fetchImplementation: typeof fetch = fetch) {
  const client = createClient<paths>({ baseUrl, fetch: fetchImplementation });
  return {
    async health() {
      const { data, error } = await client.GET(API_ROUTES.health, { signal: AbortSignal.timeout(2000) });
      if (error) throw new Error(error.error);
      return data;
    },
    async generateReport(body: ReportRequest, headers: HeadersInit) {
      const { data, error, response } = await client.POST(API_ROUTES.generateReport, { body, headers, signal: AbortSignal.timeout(30_000) });
      if (error || !data) throw new Error(error?.error || `HTTP ${response.status}`);
      return data.text;
    }
  };
}
