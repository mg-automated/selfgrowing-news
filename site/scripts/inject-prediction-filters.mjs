import {readFile, readdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
const tag = '<script src="/selfgrowing-news/static/prediction-filters.js" defer></script>'
async function inject(dir) {
 for (const entry of await readdir(dir,{withFileTypes:true})) {
  const file = path.join(dir,entry.name)
  if(entry.isDirectory()) await inject(file)
  else if(entry.name.endsWith('.html')) {
   const html = await readFile(file,'utf8')
   if(html.includes('id="prediction-topic"') && !html.includes(tag)) await writeFile(file,html.replace('</body>',tag + '</body>'))
  }
 }
}
await inject(process.argv[2])
