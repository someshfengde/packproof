import { GoogleGenAI } from '@google/genai';

export type AiMode = 'demo_fixture' | 'live_vertex' | 'live_gemini_api';
export type AiClient = Pick<GoogleGenAI, 'models'>;
type ConstructorOptions = ConstructorParameters<typeof GoogleGenAI>[0];
type ClientFactory = (options: ConstructorOptions) => AiClient;

export function createAiClient(
  mode: Exclude<AiMode, 'demo_fixture'>,
  config: { project?: string; location?: string; apiKey?: string },
  factory: ClientFactory = (options) => new GoogleGenAI(options),
): AiClient | null {
  const httpOptions = { timeout: 75_000, retryOptions: { attempts: 1 } };
  if (mode === 'live_vertex') {
    if (!config.project) return null;
    return factory({ vertexai: true, project: config.project, location: config.location ?? 'global', httpOptions });
  }
  if (!config.apiKey) return null;
  return factory({ vertexai: false, apiKey: config.apiKey, httpOptions });
}

export function isAiConfigurationReady(
  mode: AiMode,
  config: { signingSecret: string; project: string; apiKey: string; client: AiClient | null },
): boolean {
  if (!config.signingSecret) return false;
  if (mode === 'live_vertex') return Boolean(config.project && config.client);
  if (mode === 'live_gemini_api') return Boolean(config.apiKey && config.client);
  return true;
}
