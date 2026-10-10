import { wrapEffect } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const fragment = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float strength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float luma = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.08, 0.6, luma));
  outputColor = vec4(inputColor.rgb + (tint - 0.5) * strength, inputColor.a);
}`;

type SplitToneOptions = { strength?: number; shadowTint?: [number, number, number]; highlightTint?: [number, number, number] };

/** Teal shadows and amber highlights: the garage's color grade. */
export class SplitToneEffect extends Effect {
  constructor({ strength = 0.2, shadowTint = [0.38, 0.52, 0.56], highlightTint = [0.64, 0.53, 0.38] }: SplitToneOptions = {}) {
    super('SplitToneEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['shadowTint', new Uniform(new Vector3(...shadowTint))],
        ['highlightTint', new Uniform(new Vector3(...highlightTint))],
        ['strength', new Uniform(strength)],
      ]),
    });
  }
}

export const SplitTone = wrapEffect(SplitToneEffect);
