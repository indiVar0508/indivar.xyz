import '@fontsource/saira-condensed/500.css';
import '@fontsource/saira-condensed/700.css';
import '@fontsource/pt-mono/400.css';
import './ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Fallback } from './ui/Fallback';
import { supportsWebGL2 } from './webgl';

const root = createRoot(document.getElementById('app')!);
root.render(<StrictMode>{supportsWebGL2() ? <App /> : <Fallback />}</StrictMode>);
