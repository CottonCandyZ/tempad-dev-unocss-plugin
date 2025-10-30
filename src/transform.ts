import { toUnocssClass } from 'transform-to-unocss-core'
import { resolveColorTokenName } from './color-tokens'
import settings from './settings.json'

interface CssVarUsage {
  name: string
  fallback?: string
  start: number
  end: number
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitVarContent(content: string): { name: string; fallback?: string } {
  let depth = 0
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (char === '(') {
      depth++
      continue
    }
    if (char === ')') {
      depth--
      continue
    }
    if (char === ',' && depth === 0) {
      const name = content.slice(0, i).trim()
      const fallback = content.slice(i + 1).trim()
      return { name, fallback }
    }
  }

  return { name: content.trim() }
}

function parseCssVars(value: string): CssVarUsage[] {
  const result: CssVarUsage[] = []
  let offset = 0

  while (offset < value.length) {
    const start = value.indexOf('var(', offset)
    if (start === -1) break

    let cursor = start + 4
    let depth = 1
    while (cursor < value.length) {
      const char = value[cursor]
      if (char === '(') {
        depth++
      } else if (char === ')') {
        depth--
        if (depth === 0) break
      }
      cursor++
    }

    if (depth !== 0) break

    const end = cursor + 1
    const content = value.slice(start + 4, cursor)
    const { name, fallback } = splitVarContent(content)

    result.push({
      name,
      fallback,
      start,
      end,
    })

    offset = end
  }

  return result
}

function replaceVarFallbacks(value: string, vars: CssVarUsage[]) {
  if (!vars.length) return value

  let result = ''
  let lastIndex = 0

  for (const cssVar of vars) {
    result += value.slice(lastIndex, cssVar.start)

    if (cssVar.fallback) result += cssVar.fallback
    else result += value.slice(cssVar.start, cssVar.end)

    lastIndex = cssVar.end
  }

  result += value.slice(lastIndex)
  return result
}

function replaceFallbackWithToken(
  className: string,
  fallback: string,
  token: string,
) {
  const trimmed = fallback.trim()
  if (!trimmed) return className

  const variants = new Set<string>()
  variants.add(trimmed)

  const compact = trimmed.replace(/\s+/g, '')
  variants.add(compact)
  variants.add(trimmed.toLowerCase())
  variants.add(compact.toLowerCase())
  variants.add(trimmed.toUpperCase())
  variants.add(compact.toUpperCase())

  let next = className
  for (const variant of variants) {
    if (!variant) continue

    const escaped = escapeRegExp(variant)
    const bracketPattern = new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'g')
    const hyphenPattern = new RegExp(`-${escaped}(?=[^\\w-]|$)`, 'g')

    next = next.replace(bracketPattern, token)
    next = next.replace(hyphenPattern, `-${token}`)
  }

  return next
}

function replaceVarExpressions(className: string, name: string, token: string) {
  const escapedName = escapeRegExp(name)
  const pattern = new RegExp(`var\\(\\s*${escapedName}\\s*\\)`, 'g')
  return className.replace(pattern, token)
}

function cleanupBracketTokens(className: string) {
  return className.replace(/\[([\w-]+)\]/g, '$1')
}

function applyTokenReplacements(className: string, vars: CssVarUsage[]) {
  if (!className || !vars.length) return className

  let next = className

  for (const cssVar of vars) {
    const tokenName = resolveColorTokenName(cssVar.name)
    if (!tokenName) continue

    if (cssVar.fallback)
      next = replaceFallbackWithToken(next, cssVar.fallback, tokenName)

    next = replaceVarExpressions(next, cssVar.name, tokenName)
  }

  return cleanupBracketTokens(next)
}

function formatNumber(value: number) {
  const rounded = Number(value.toFixed(6))
  if (Number.isInteger(rounded)) return Math.trunc(rounded).toString()

  return rounded.toString().replace(/\.?0+$/, '')
}

function normalizeUnoClass(className: string, hasPx: boolean) {
  if (!className) return className

  let next = className

  next = next.replace(
    /\bborder-(\d+\.\d+|\d+)(?![\w-])/g,
    (_, value) => `border-${formatNumber(Number(value) * 4)}`,
  )
  next = next.replace(
    /\b(border-[xylrtb]-)(\d+\.\d+|\d+)(?![\w-])/g,
    (_, prefix, value) => `${prefix}${formatNumber(Number(value) * 4)}`,
  )
  next = next.replace(
    /(p[trblxy]?)-(\d+\.\d+|\d+)px\b/g,
    (_, prefix, value) => `${prefix}-${formatNumber(Number(value))}`,
  )
  next = next.replace(/(-?\d+(?:\.\d+)?)px\b/g, '$1')
  next = next.replace(/\[(\d+(?:\.\d+)?)\]/g, '$1')

  if (!hasPx) {
    next = next.replace(
      /(p[trblxy]?)-(\d+\.\d+|\d+)(?![\w-])/g,
      (_, prefix, value) => `${prefix}-${formatNumber(Number(value) * 4)}`,
    )
  }

  return next
}

export function transformToAtomic(
  style: Record<string, string>,
  options: { isRem: boolean; prefix: string },
) {
  const { isRem = false, prefix = '' } = options
  const raw = Object.entries(style).filter(
    ([key]) => !settings.noNeedStylesKey.includes(key),
  )

  const prepared = raw.map(([key, value]) => {
    const withoutComments = value.replace(/\/\*.*\*\//g, '')
    const cssValue = withoutComments.trim()
    const cssVars = parseCssVars(cssValue)
    const unoValue = replaceVarFallbacks(cssValue, cssVars).trim()

    return {
      key,
      cssValue,
      unoValue,
      cssVars,
      hasPx: /px/.test(unoValue),
      unoClass: toUnocssClass(`${key}: ${unoValue}`, isRem)[0],
    }
  })

  const cssCode = prepared
    .map(({ key, cssValue }) => `${key}: ${cssValue};`)
    .join('\n')

  const uno = prepared
    .map(({ unoClass, hasPx, cssVars }) => {
      const normalized = normalizeUnoClass(unoClass, hasPx)
      return normalized
        ? applyTokenReplacements(normalized, cssVars)
        : normalized
    })
    .filter(Boolean)
    .map((cls) => `${prefix}${cls}`)
    .join(' ')

  return {
    cssCode,
    uno,
  }
}
