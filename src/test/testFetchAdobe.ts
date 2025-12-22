import { readFile } from 'fs/promises'
import { writeFile } from 'fs/promises'
import { exec } from 'child_process'
import * as cheerio from 'cheerio'

export async function fetchAdobeTerms() {
  const html = await readFile('adobe.html', 'utf8');

  const parseFunc = cheerio.load(html);

  parseFunc('script, style, noscript').remove();

  const parsedHtml = parseFunc('body')
    .text()
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  console.log(parsedHtml);
  writeText(parsedHtml);
}

export async function compareTexts() {
  try {
    const diffText = await gitDiff('src/text/a.txt', 'adobe.html')

    if (diffText.trim().length === 0) {
      console.log('差分なし')
    } else {
      console.log(diffText)
    }
  } catch (e) {
    console.error(e)
  }
}

export async function writeText(text: string) {
  try {
    await writeFile('src/text/a.txt', text, 'utf8')
    console.log('ファイルが正常に書き込まれました。')
    const writtenText = await readFile('src/text/a.txt', 'utf8')
    console.log(writtenText);
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
      `git diff --no-index --color=never ${beforePath} ${afterPath}`,
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

fetchAdobeTerms().catch(console.error)
//compareTexts().catch(console.error)
//writeTest().catch(console.error)
