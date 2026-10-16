// Writes the fixture files to a folder: node test/helpers/write-fixtures.js <dir>
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { reportImage, scannedPdf, textPdf } from './fixtures.js'
const dir = process.argv[2] || '.'
writeFileSync(path.join(dir, 'report-text.pdf'), textPdf())
writeFileSync(path.join(dir, 'report-scanned.pdf'), scannedPdf())
writeFileSync(path.join(dir, 'report-photo.png'), reportImage())
