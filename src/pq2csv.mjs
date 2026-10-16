import { parquetReadObjects, parquetMetadata } from './hyparquet/src/index.js'
import fs from 'fs'
const out = fs.createWriteStream(process.argv[2]); let header = null
for (const f of process.argv.slice(3)) {
  const b = fs.readFileSync(f); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const md = parquetMetadata(ab); console.error(f.split('/').pop(), 'rows', Number(md.num_rows), 'codec', md.row_groups[0].columns[0].meta_data.codec)
  const rows = await parquetReadObjects({ file: ab })
  if (!header) { header = Object.keys(rows[0]); out.write(header.join(',') + '\n') }
  for (const r of rows) out.write(header.map(k => { let v = r[k]; if (typeof v === 'bigint') v = Number(v); if (v instanceof Date) v = v.toISOString().slice(0,10); v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }).join(',') + '\n')
}
out.end()
