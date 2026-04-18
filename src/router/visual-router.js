// Visual AI router — images, video, logos via Replicate & Fal
import Replicate from 'replicate';
import axios from 'axios';
import { logger } from '../utils/logger.js';

export class VisualRouter {
  constructor() {
    this.replicate = process.env.REPLICATE_API_TOKEN
      ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
      : null;
    this.falKey = process.env.FAL_KEY;
  }

  // Generate image — tries Fal first (fastest), then Replicate
  async generateImage({ prompt, aspectRatio = '1:1', style = 'realistic' }) {
    if (this.falKey) {
      try { return await this.falFlux(prompt, aspectRatio); } catch (e) {
        logger.warn(`Fal failed: ${e.message}`);
      }
    }
    if (this.replicate) {
      try { return await this.replicateFlux(prompt, aspectRatio); } catch (e) {
        logger.warn(`Replicate failed: ${e.message}`);
      }
    }
    throw new Error('No visual AI provider available');
  }

  async falFlux(prompt, aspectRatio) {
    const res = await axios.post(
      'https://fal.run/fal-ai/flux/schnell',
      { prompt, image_size: this.mapAspectFal(aspectRatio), num_inference_steps: 4 },
      { headers: { Authorization: `Key ${this.falKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const url = res.data?.images?.[0]?.url;
    if (!url) throw new Error('Fal: no image URL in response');
    return { url, provider: 'fal-flux-schnell' };
  }

  async replicateFlux(prompt, aspectRatio) {
    const output = await this.replicate.run(
      'black-forest-labs/flux-schnell',
      { input: { prompt, aspect_ratio: aspectRatio, num_outputs: 1 } }
    );
    const url = Array.isArray(output) ? output[0] : output;
    return { url: typeof url === 'string' ? url : url?.url?.() || '', provider: 'replicate-flux' };
  }

  // Generate short marketing video
  async generateVideo({ prompt, duration = 5 }) {
    if (!this.falKey) throw new Error('FAL_KEY required for video');
    const res = await axios.post(
      'https://fal.run/fal-ai/kling-video/v1/standard/text-to-video',
      { prompt, duration: String(duration), aspect_ratio: '16:9' },
      { headers: { Authorization: `Key ${this.falKey}` }, timeout: 180000 }
    );
    return { url: res.data?.video?.url, provider: 'fal-kling' };
  }

  // Logo specifically — better model for text/vector
  async generateLogo({ brandName, style = 'modern minimalist' }) {
    const prompt = `Professional logo for "${brandName}", ${style}, flat design, clean vector style, white background, centered, no text rendering artifacts`;
    return this.generateImage({ prompt, aspectRatio: '1:1' });
  }

  mapAspectFal(a) {
    return { '1:1': 'square_hd', '16:9': 'landscape_16_9', '9:16': 'portrait_16_9',
             '4:3': 'landscape_4_3', '3:4': 'portrait_4_3' }[a] || 'square_hd';
  }
}
