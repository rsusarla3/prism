# Prism extension engine options

Prism's extension is page-driven. Every provider receives only the active-page
text or explicit selection for the current request; Prism Core and Prism Future
curriculum data are not inputs to this pipeline.

## Recommended hackathon stack

| Capability | No-key default | Optional hosted upgrade | Self-hosted option |
|---|---|---|---|
| Page extraction | DOM, accessible labels, permitted frames | — | — |
| Summary, quiz, key terms | Deterministic local analyzer | Gemini, OpenAI, Anthropic, or another compatible text API | Ollama with Qwen, Gemma, Llama, Mistral, or DeepSeek weights |
| Translation | Chrome on-device Translator when available | Google Cloud Translation, Azure Translator, or DeepL | Argos Translate or LibreTranslate |
| Read aloud | Browser speech synthesis | ElevenLabs, OpenAI Audio, Azure Speech, Google TTS, or Amazon Polly | Kokoro, Piper, or CosyVoice |
| OCR for screenshots | Accessible DOM text first | Google Vision, Azure Document Intelligence, AWS Textract, or Mistral OCR | PaddleOCR |
| Concept image | Prism SVG concept map | OpenAI Images, Google Imagen, Stability, or hosted FLUX | Qwen-Image, FLUX, or Stable Diffusion |
| Short video | Animated concept map/storyboard | Runway, Luma, Veo, Sora, Kling, or Hailuo | Wan |

## What to use first

1. Keep the five modes useful without an API key. The current summary, quiz,
   terms, responsive HTML visual, and browser narration already satisfy that
   requirement.
2. Use one provider-neutral text seam. Prism supports Gemini directly and any
   OpenAI-compatible endpoint through `LLM_BASE_URL`, `LLM_MODEL`, and optional
   `LLM_API_KEY`.
3. For a local demo, use Ollama with a modest instruct model. A Qwen model is a
   strong multilingual choice; use a model size that fits the host laptop.
4. Add PaddleOCR only for screenshots or canvas content that has no accessible
   text. Ordinary pages should stay on the faster and more private DOM path.
5. Generate one source-grounded educational image for the active tab, using a
   portrait layout, large labels, and a deep navy canvas that fits Prism's side
   panel. Start the viewer enlarged and provide explicit zoom controls so dense
   details remain readable. Detect bright legacy canvases and blend them into
   the dark UI. Keep the deterministic local SVG concept map as the zero-key and
   provider-error fallback.

## Important tradeoffs

- Open weights do not mean free hosting. Compute, memory, latency, monitoring,
  and bandwidth still cost money.
- Verify the exact checkpoint license, not only the model family's marketing
  page. Licenses can vary within a family.
- Browser-local and self-hosted paths provide the strongest privacy because
  page content does not have to reach a third-party model vendor.
- Hosted APIs are easier to demo and generally faster, but require credentials,
  usage controls, deletion/retention review, and a clear user disclosure.
- Never place provider keys in the extension. All paid-provider calls belong on
  the Prism server.

## Primary references

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [Chrome on-device Translator API](https://developer.chrome.com/docs/ai/translator-api)
- [PaddleOCR documentation](https://www.paddleocr.ai/main/en/index/)
- [Qwen-Image repository and license](https://github.com/QwenLM/Qwen-Image)
- [Wan 2.1 repository and license](https://github.com/Wan-Video/Wan2.1)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
