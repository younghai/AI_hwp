// v4/tests/fixtures/build-test-fixtures.mjs
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ZipWriter, BlobWriter, TextReader } from '@zip.js/zip.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function makeZip(entries) {
  const blobWriter = new BlobWriter('application/zip')
  const writer = new ZipWriter(blobWriter)
  for (const [name, content] of entries) {
    await writer.add(name, new TextReader(content))
  }
  await writer.close()
  const blob = await blobWriter.getData()
  return Buffer.from(await blob.arrayBuffer())
}

const HEADER_WITH_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="hangul">
        <hh:font id="0" type="ttf" name="함초롱바탕"/>
        <hh:font id="1" type="ttf" name="HY헤드라인M"/>
        <hh:font id="2" type="ttf" name="UnknownFont"/>
      </hh:fontface>
    </hh:fontfaces>
  </hh:refList>
</hh:head>`

const HEADER_NO_FONTS = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:refList></hh:refList>
</hh:head>`

;(async () => {
  const withFonts = await makeZip([
    ['mimetype', 'application/hwp+zip'],
    ['Contents/header.xml', HEADER_WITH_FONTS]
  ])
  await fs.writeFile(path.join(__dirname, 'sample-with-fonts.hwpx'), withFonts)

  const noFonts = await makeZip([
    ['mimetype', 'application/hwp+zip'],
    ['Contents/header.xml', HEADER_NO_FONTS]
  ])
  await fs.writeFile(path.join(__dirname, 'sample-no-fonts.hwpx'), noFonts)

  // corrupt = zip 헤더 PK\x03\x04 로 시작하지만 body 는 garbage
  await fs.writeFile(
    path.join(__dirname, 'sample-corrupt.hwpx'),
    Buffer.concat([
      Buffer.from('504b0304', 'hex'),
      Buffer.from('corrupt-content-not-a-real-zip')
    ])
  )

  console.log('fixtures built')
})()
