import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)

function loadDynamicToken(fetchImpl, options = {}) {
  const ts = require('typescript')
  const sourcePath = path.resolve('src/utils/dynamicToken.ts')
  const source = fs.readFileSync(sourcePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  })

  const module = { exports: {} }
  const sandbox = {
    console,
    Date: options.DateImpl || Date,
    exports: module.exports,
    fetch: fetchImpl,
    module,
    process,
    require,
  }

  vm.runInNewContext(outputText, sandbox, { filename: sourcePath })
  return module.exports
}

function createMockDate(nowRef) {
  return class MockDate extends Date {
    constructor(...args) {
      super(args.length > 0 ? args[0] : nowRef.value)
    }

    static now() {
      return nowRef.value
    }
  }
}

function createTimeResponse(timeString = '202607061200') {
  return {
    ok: true,
    async json() {
      return {
        timestamp: new Date('2026-07-06T04:00:00Z').getTime(),
        timeString,
      }
    },
  }
}

test('reuses the server time string for sequential token generation inside the ttl', async () => {
  process.env.NEXT_PUBLIC_API_KEY = 'test-key'
  let fetchCount = 0
  const dynamicToken = loadDynamicToken(async () => {
    fetchCount += 1
    return createTimeResponse()
  })

  await dynamicToken.generateDynamicTokenWithServerTime()
  await dynamicToken.generateDynamicTokenWithServerTime()

  assert.equal(fetchCount, 1)
})

test('deduplicates concurrent server time requests', async () => {
  process.env.NEXT_PUBLIC_API_KEY = 'test-key'
  let fetchCount = 0
  const dynamicToken = loadDynamicToken(async () => {
    fetchCount += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return createTimeResponse()
  })

  const tokens = await Promise.all([
    dynamicToken.generateDynamicTokenWithServerTime(),
    dynamicToken.generateDynamicTokenWithServerTime(),
    dynamicToken.generateDynamicTokenWithServerTime(),
  ])

  assert.equal(fetchCount, 1)
  assert.equal(tokens.every((token) => typeof token === 'string' && token.length > 0), true)
})

test('refreshes the server time string after the ttl expires', async () => {
  process.env.NEXT_PUBLIC_API_KEY = 'test-key'
  const nowRef = { value: new Date('2026-07-06T12:00:00Z').getTime() }
  const DateImpl = createMockDate(nowRef)
  let fetchCount = 0
  const dynamicToken = loadDynamicToken(async () => {
    fetchCount += 1
    return {
      ok: true,
      async json() {
        return { timeString: fetchCount === 1 ? '202607061200' : '202607061201' }
      },
    }
  }, { DateImpl })

  await dynamicToken.generateDynamicTokenWithServerTime()
  nowRef.value += 29 * 1000
  await dynamicToken.generateDynamicTokenWithServerTime()
  assert.equal(fetchCount, 1)

  nowRef.value += 2 * 1000
  await dynamicToken.generateDynamicTokenWithServerTime()

  assert.equal(fetchCount, 2)
})

test('uses the server timeString directly instead of local timezone formatting', async () => {
  process.env.NEXT_PUBLIC_API_KEY = 'test-key'
  const dynamicToken = loadDynamicToken(async () => ({
    ok: true,
    async json() {
      return {
        timestamp: new Date('2026-07-06T04:12:00Z').getTime(),
        timeString: '202607060412',
      }
    },
  }))

  const token = await dynamicToken.generateDynamicTokenWithServerTime()

  assert.equal(token, dynamicToken.generateDynamicToken('202607060412'))
  assert.notEqual(token, dynamicToken.generateDynamicToken('202607061212'))
})

test('resetServerTimeOffset clears the cached server time string', async () => {
  process.env.NEXT_PUBLIC_API_KEY = 'test-key'
  let fetchCount = 0
  const dynamicToken = loadDynamicToken(async () => {
    fetchCount += 1
    return createTimeResponse()
  })

  assert.equal(typeof dynamicToken.resetServerTimeOffset, 'function')

  await dynamicToken.generateDynamicTokenWithServerTime()
  dynamicToken.resetServerTimeOffset()
  await dynamicToken.generateDynamicTokenWithServerTime()

  assert.equal(fetchCount, 2)
})
