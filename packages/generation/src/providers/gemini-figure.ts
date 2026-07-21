export interface FigureImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  dataBase64: string;
}

export interface FigureClient {
  readonly model: string;
  generate(prompt: string): Promise<FigureImage>;
}

export interface GeminiFigureClientOptions {
  apiKey: string;
  model?: string;
}

export const DEFAULT_GEMINI_FIGURE_MODEL = 'gemini-2.5-flash-image';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
}

interface GeminiErrorResponse {
  error?: { code?: number; message?: string; status?: string };
}

async function readGeminiError(response: Response): Promise<GeminiErrorResponse['error']> {
  try {
    return ((await response.json()) as GeminiErrorResponse).error;
  } catch {
    return undefined;
  }
}

function figureError(responseStatus: number, providerError: GeminiErrorResponse['error'], model: string): Error {
  const status = providerError?.status?.toUpperCase() ?? '';
  const detail = providerError?.message?.toLowerCase() ?? '';
  const message = responseStatus === 401 || detail.includes('api key not valid')
    ? 'Gemini rejected the API key.'
    : responseStatus === 403 || detail.includes('billing')
      ? 'Gemini image generation requires an API project with billing and image-model access enabled.'
      : responseStatus === 429 || status === 'RESOURCE_EXHAUSTED'
        ? 'Gemini image generation quota was reached. Try again later.'
        : responseStatus === 400 || status === 'INVALID_ARGUMENT'
          ? 'Gemini rejected the image request configuration. Check GEMINI_IMAGE_MODEL or update Prism.'
          : responseStatus === 404 || status === 'NOT_FOUND'
            ? `Gemini image model “${model}” is not available to this API project.`
            : 'Gemini image generation failed. The local evidence map is still available.';
  return Object.assign(new Error(message), { status: responseStatus === 429 ? 429 : 502 });
}

export function createGeminiFigureClient(options: GeminiFigureClientOptions): FigureClient {
  const model = options.model ?? DEFAULT_GEMINI_FIGURE_MODEL;
  return {
    model,
    async generate(prompt) {
      const generationConfig = model.startsWith('gemini-3')
        ? { responseModalities: ['IMAGE'], responseFormat: { image: { aspectRatio: '3:4', imageSize: '1K' } } }
        : undefined;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        ...(generationConfig ? { generationConfig } : {}),
      };
      const request = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify(body),
      };
      let response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`, request);
      let providerError = response.ok ? undefined : await readGeminiError(response);
      if (response.status === 404) {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, request);
        providerError = response.ok ? undefined : await readGeminiError(response);
      }
      if (!response.ok) {
        throw figureError(response.status, providerError, model);
      }
      const responseBody = await response.json() as GeminiImageResponse;
      const image = responseBody.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).find((part) => part.inlineData?.data)?.inlineData;
      const mimeType = image?.mimeType;
      const dataBase64 = image?.data;
      if (!dataBase64 || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType ?? '')) {
        throw Object.assign(new Error('Gemini did not return a supported image.'), { status: 502 });
      }
      if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(dataBase64)) throw Object.assign(new Error('Gemini returned invalid image data.'), { status: 502 });
      if (Math.ceil(dataBase64.length * 0.75) > MAX_IMAGE_BYTES) throw Object.assign(new Error('Gemini returned an image that is too large.'), { status: 502 });
      return { mimeType: mimeType as FigureImage['mimeType'], dataBase64 };
    },
  };
}
