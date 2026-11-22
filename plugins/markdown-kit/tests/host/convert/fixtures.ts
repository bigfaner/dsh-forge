// doc-convert 单测 fixture 构造器（进程内纯函数——零外部二进制）：
//   - buildDocx(): 最小合法 docx（stored zip 手拼——零压缩条目 + 手算 CRC32），
//     含 Heading1 标题 / 正文段 / 内嵌 1x1 PNG 图片（assets/discard 策略断言面）。
//   - buildPdf(): 最小合法 PDF（两页各一文本块，xref 偏移程序化计算）。
//   - buildCorruptDocx(): 魔数缺席的伪 docx（CD-6 引擎失败样本）。

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// ---- stored zip 手拼 ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
}

/** stored（零压缩）zip 手拼——本地头 + 中央目录，版本 2.0 / method 0 */
function zipStore(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, entry.data)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(entry.data.length, 20)
    cd.writeUInt32LE(entry.data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)
    offset += local.length + nameBuf.length + entry.data.length
  }
  const cdStart = offset
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(cdStart, 16)
  return Buffer.concat([...chunks, cdBuf, end])
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function docxDocumentXml(): string {
  return (
    XML_DECL +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Report</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Hello body paragraph.</w:t></w:r></w:p>` +
    `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="990600" cy="990600"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="chart"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="990600" cy="990600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
    `</w:body></w:document>`
  )
}

/** 最小合法 docx（含标题/正文/1 张内嵌 PNG） */
export function buildDocx(): Buffer {
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        XML_DECL +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Default Extension="png" ContentType="image/png"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
          `</Types>`,
        'utf8',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        XML_DECL +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: Buffer.from(
        XML_DECL +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>` +
          `</Relationships>`,
        'utf8',
      ),
    },
    {
      name: 'word/styles.xml',
      data: Buffer.from(
        XML_DECL +
          `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
          `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
          `</w:styles>`,
        'utf8',
      ),
    },
    { name: 'word/document.xml', data: Buffer.from(docxDocumentXml(), 'utf8') },
    { name: 'word/media/image1.png', data: PNG_1X1 },
  ])
}

/** 魔数缺席伪 docx（引擎失败样本——非 zip 结构） */
export function buildCorruptDocx(): Buffer {
  return Buffer.from('this is not a zip archive at all', 'utf8')
}

// ---- PDF 手拼 ----

/**
 * 最小合法 PDF：每页一个文本块（Helvetica Type1 非内嵌字体 + BT/Tj 文本操作符），
 * xref 偏移程序化计算。
 */
export function buildPdf(pageTexts: string[]): Buffer {
  const objects: string[] = []
  const pageIds = pageTexts.map((_, i) => 3 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`
  pageTexts.forEach((text, i) => {
    const pageId = pageIds[i]!
    const contentId = pageId + 1
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/([\\()])/g, '\\$1')}) Tj ET`
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${3 + pageTexts.length * 2} 0 R >> >> >>`
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })
  objects[3 + pageTexts.length * 2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'latin1')
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) {
    xref += `${String(offsets[id]!).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}
