import { readFile } from 'fs/promises'
import { writeFile } from 'fs/promises'
import { exec } from 'child_process'
import * as cheerio from 'cheerio'

export async function fetchAdobeTerms() {
  const html = await readFile('adobe.html', 'utf8')

  const parseFunc = cheerio.load(html)

  parseFunc('script, style, noscript').remove()

  const parsedHtml = parseFunc('body')
    .text()
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  parsedHtml
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(l))
    .filter((l) => l !== 'style' && l !== 'layout')
    .join('\n')

  await writeText(parsedHtml)
}

export async function getAIText(diff: string, url: string) {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is missing')

  const prompt = [
    `次の規約ページの差分を、Slack通知向けに日本語で短く要約してください。`,
    ``,
    `- 対象URL: ${url}`,
    ``,
    `要約の条件:`,
    `- 3〜6個の箇条書き`,
    `- 変更点の種類（追加/削除/言い回し変更/日付更新など）を優先`,
    `- 推測はしない（差分から読み取れる範囲のみ）`,
    ``,
    `差分:`,
    diff
  ].join('\n')

  const res = await fetch(
    'https://models.github.ai/inference/chat/completions',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300
      })
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub Models API failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as any
  const summary = data?.choices?.[0]?.message?.content
  console.log(summary)
}

export async function compareTexts() {
  try {
    const diffText = await gitDiff('src/text/a.txt', 'src/text/b.txt')

    if (diffText.trim().length === 0) {
      console.log('差分なし')
    } else {
      console.log(diffText)
      await getAIText(diffText, 'https://www.adobe.com/jp/legal/terms.html')
    }
  } catch (e) {
    console.error(e)
  }
}

export async function writeText(text: string) {
  try {
    await writeFile('src/text/a.txt', text, 'utf8')
    console.log('ファイルが正常に書き込まれました。')
  } catch (error) {
    console.error('ファイルの書き込みに失敗しました:', error)
  }
}

export async function writeTest() {
  writeText('this is a test')
}

export function gitDiff(
  beforePath: string,
  afterPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      `git diff --no-index --color=never -U0 --ignore-blank-lines -w  --word-diff=plain ${beforePath} ${afterPath}`,
      (err, stdout, stderr) => {
        if (err && err.code !== 1) {
          reject(stderr || err)
        } else {
          resolve(stdout)
        }
      }
    )
  })
}

async function main() {
  await fetchAdobeTerms()
  await compareTexts()
}

main().catch(console.error)
