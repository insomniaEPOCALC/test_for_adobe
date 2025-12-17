import { readFile } from "fs/promises";

export async function fetchAdobeTerms() {
  const html = await readFile("adobe.html", "utf8");

  console.log(html);

}

fetchAdobeTerms().catch(console.error);
