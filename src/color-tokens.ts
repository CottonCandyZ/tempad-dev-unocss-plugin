export interface ColorTokenRule {
  test: RegExp
  resolve(match: RegExpMatchArray): string
}

function createRule(pattern: RegExp, resolver: (match: RegExpMatchArray) => string): ColorTokenRule {
  return {
    test: pattern,
    resolve: resolver,
  }
}

export const COLOR_TOKEN_RULES: ColorTokenRule[] = [
  createRule(/^background-bg(\d+)$/i, ([, index]) => `bg_${index}`),
  createRule(/^text-symbol-text-(\d+)$/i, ([, index]) => `text_${index}`),
  createRule(/^text-(\d+)$/i, ([, index]) => `text_${index}`),
  createRule(/^norm-brand_pink$/i, () => 'brand_pink'),
  createRule(/^norm-brand_blue$/i, () => 'brand_blue'),
  createRule(/^line-line_light$/i, () => 'line_light'),
]

export function resolveColorTokenName(variableName: string): string | null {
  const normalized = variableName.replace(/^--/, '')

  for (const rule of COLOR_TOKEN_RULES) {
    const match = normalized.match(rule.test)
    if (match)
      return rule.resolve(match)
  }

  return null
}
