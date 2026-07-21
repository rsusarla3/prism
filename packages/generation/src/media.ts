/**
 * Media attachment — the second, optional pass over a StudyBundle.
 *
 * The bundle is the plan and returns on its own (~25s). Media is additive: a
 * renderer that gets no audio falls back to the browser's SpeechSynthesis,
 * which supplies its own word boundaries. Nothing here is required to teach the
 * lesson, so a provider failure degrades the bundle rather than failing it.
 */
import type { MediaAsset, StudyBundle } from 'prism-shared';

export interface SpeechClient {
  speak(args: { text: string; language: string }): Promise<MediaAsset>;
}

export interface ImageClient {
  draw(args: { prompt: string; altText: string }): Promise<MediaAsset>;
}

export interface MediaClients {
  speech?: SpeechClient;
  image?: ImageClient;
}

export interface AttachMediaResult {
  bundle: StudyBundle;
  /** Provider failures, by asset. Empty when everything requested succeeded. */
  failures: Array<{ asset: 'listen.audio' | 'watch.image'; message: string }>;
}

/**
 * Fills listen.audio and watch.image when the matching client is configured.
 * Both run concurrently — they are independent calls to different providers.
 */
export async function attachMedia(bundle: StudyBundle, clients: MediaClients): Promise<AttachMediaResult> {
  const failures: AttachMediaResult['failures'] = [];

  const [audio, image] = await Promise.all([
    clients.speech
      ? clients.speech.speak({ text: bundle.listen.script, language: bundle.meta.language }).catch((e: unknown) => {
        failures.push({ asset: 'listen.audio', message: errorMessage(e) });
        return null;
      })
      : null,
    clients.image
      ? clients.image.draw({ prompt: imagePrompt(bundle), altText: bundle.watch.altText }).catch((e: unknown) => {
        failures.push({ asset: 'watch.image', message: errorMessage(e) });
        return null;
      })
      : null,
  ]);

  return {
    bundle: {
      ...bundle,
      listen: audio ? { ...bundle.listen, audio } : bundle.listen,
      watch: image ? { ...bundle.watch, image } : bundle.watch,
    },
    failures,
  };
}

/** Builds the diagram brief from the steps the model already wrote. */
function imagePrompt(bundle: StudyBundle): string {
  const steps = bundle.watch.steps.map((step, i) => `${i + 1}. ${step.caption}: ${step.description}`).join('\n');
  return `A clear, labelled educational ${bundle.watch.kind} for a grade ${bundle.meta.inferredGrade} learner, titled "${bundle.meta.title}". No decorative detail that does not teach the idea. Show these steps:\n${steps}`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
