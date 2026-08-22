import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebSearchDeepseek from '@deepseek-ai/dsh-web-search-deepseek'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { pathToFileURL } from 'node:url'

async function main(): Promise<void> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL('/Users/kongkang/Developer/deepseek-harness/.worktree/voice-skill-design/').href + '/'
  await ctx.plugin(Credentials)
  await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })
  await ctx.plugin(WebSearchDeepseek, { apiKeyEnv: 'DEEPSEEK_API_KEY' })

  try {
    const result = await ctx.web.search({ query: '最近上映的电影推荐', maxResults: 3 })
    console.log('SEARCH OK. sources =', result.sources.length)
    console.log('first source =', JSON.stringify(result.sources[0] ?? null))
  } catch (error) {
    console.log('SEARCH FAILED:', error?.code ?? '', error?.message ?? error)
  }
  await ctx.fiber?.dispose?.()
  process.exit(0)
}

main().catch((error) => { console.error(error); process.exit(1) })
