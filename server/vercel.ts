export interface VercelRequest {
  url: string;
  headers: { host?: string };
}

export interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  send(body: string): void;
  json(body: unknown): void;
}
