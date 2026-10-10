import '@fontsource/saira-condensed/500.css';
import '@fontsource/saira-condensed/700.css';
import '@fontsource/pt-mono/400.css';
import './ui/base.css';
import './ui/hud.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bindAudio } from './audio/bindings';
import { QA } from './qa';
import { useGarage } from './state/store';
import { Fallback } from './ui/Fallback';
import { supportsWebGL2 } from './webgl';

if (QA) Object.assign(window, { garage: useGarage });

bindAudio();

const root = createRoot(document.getElementById('app')!);
root.render(<StrictMode>{supportsWebGL2() ? <App /> : <Fallback />}</StrictMode>);
