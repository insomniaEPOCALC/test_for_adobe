export async function fetchAdobeTerms() {
  const url = 'https://www.adobe.com/jp/legal/terms.html'

  const res = await fetch(url)
  if (!res.ok) {
    console.error('エラー:', res.status);
    return
  }

  const html = await res.text();

  console.log(html);

}

fetchAdobeTerms().catch(console.error);
