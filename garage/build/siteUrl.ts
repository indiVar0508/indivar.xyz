// Reads `url` and `baseurl` from the Jekyll config so the garage's canonical link matches the site's.

export function readYamlScalar(yaml: string, key: string): string | undefined {
  const match = yaml.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].replace(/\s+#.*$/, '').trim();
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

export function garageCanonical(configYaml: string, baseOverride?: string): string {
  const url = readYamlScalar(configYaml, 'url');
  if (!url) throw new Error('_config.yml has no url');
  const base = (baseOverride ?? readYamlScalar(configYaml, 'baseurl') ?? '').replace(/\/+$/, '');
  return `${url.replace(/\/+$/, '')}${base}/garage/`;
}
