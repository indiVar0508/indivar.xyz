import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useGarage } from '../state/store';
import { SplitTone } from './splitTone';

export function Effects() {
  const quality = useGarage((state) => state.quality);
  if (quality === 'low') {
    return (
      <EffectComposer key="low" multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.7} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SplitTone strength={0.12} />
        <Vignette offset={0.22} darkness={0.6} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer key="high" multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SplitTone strength={0.12} />
      <Vignette offset={0.22} darkness={0.6} />
      <Noise opacity={0.035} premultiply />
    </EffectComposer>
  );
}
