import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { garageCanonical, readYamlScalar } from './siteUrl.ts';

const realConfig = readFileSync(new URL('../../_config.yml', import.meta.url), 'utf8');

describe('garageCanonical', () => {
  it('uses the site url and baseurl from _config.yml', () => {
    expect(garageCanonical(realConfig)).toBe('https://indivar.xyz/garage/');
  });

  it('lets a preview build override the baseurl', () => {
    expect(garageCanonical(realConfig, '/preview')).toBe('https://indivar.xyz/preview/garage/');
  });

  it('ignores quotes, trailing slashes and comments', () => {
    const yaml = 'title: x\nurl: "https://example.com/"\nbaseurl: \'/repo/\' # project site\n';
    expect(garageCanonical(yaml)).toBe('https://example.com/repo/garage/');
  });

  it('does not read baseurl when asked for url', () => {
    expect(readYamlScalar('baseurl: "/b"\n', 'url')).toBeUndefined();
  });

  it('fails loudly without a url', () => {
    expect(() => garageCanonical('title: x\n')).toThrow('_config.yml has no url');
  });
});
