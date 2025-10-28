import { readFileSync, writeFileSync } from 'node:fs'
import { defineBuildConfig } from 'unbuild'
import packageJson from './package.json'

const buildTimestamp = new Date().toISOString()
const bundleBanner = `// @cotton/unocss v${packageJson.version ?? '0.0.0'} built at ${buildTimestamp}`

export default defineBuildConfig({
  entries: ['src/index'],
  clean: true,
  externals: [],
  rollup: {
    inlineDependencies: true,
    resolve: {
      preferBuiltins: false,
    },
    esbuild: {
      minify: true,
    },
    output: {
      banner: bundleBanner,
    },
  },
  hooks: {
    'build:before': (ctx) => {
      ctx.options.externals = ctx.options.externals.filter((external) => {
        if (typeof external === 'string')
          return external !== 'transform-to-unocss-core'

        return true
      })
    },
    'build:done': () => {
      const distFile = new URL('./dist/index.mjs', import.meta.url)
      const comment = `${bundleBanner}\n`
      const contents = readFileSync(distFile, 'utf8')
      if (contents.startsWith(comment)) return
      writeFileSync(distFile, `${comment}${contents}`)
    },
  },
})
