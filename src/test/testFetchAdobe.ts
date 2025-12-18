import { readFile } from 'fs/promises'
import { writeFile } from "fs/promises";
import { exec } from 'child_process'

export async function fetchAdobeTerms() {
  const html = await readFile('adobe.html', 'utf8')

  console.log(html)
}

export async function compareTexts() {
  try {
    const diffText = await gitDiff('src/text/a.txt', 'src/text/b.txt')

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
    console.log("ファイルが正常に書き込まれました。");
  } catch (error) {
    console.error("ファイルの書き込みに失敗しました:", error);
  }
}

export async function writeTest(){
  writeText("this is a test");
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

//fetchAdobeTerms().catch(console.error)
compareTexts().catch(console.error)
writeTest().catch(console.error)