export interface FileWithStatus {
  file: File
  id: string
  previewUrl: string
  status: 'uploading' | 'uploaded' | 'error'
  uploadedUrl?: string
  uploadedPathname?: string
  error?: string
}

export const FILE_UPLOAD_CONFIG = {
  maxSize: 32 * 1024 * 1024,
  maxSizeString: '32MB' as const,
  types: ['image', 'pdf', 'text/csv', 'application/pdf', 'application/vnd.ms-excel'],
  acceptPattern: '.pdf,application/pdf,image/*,.csv,text/csv,application/vnd.ms-excel'
} as const

export function getFileIcon(mimeType: string, fileName?: string): string {
  const type = mimeType.toLowerCase()
  const name = fileName?.toLowerCase() || ''

  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'i-lucide-file-text'
  if (type.includes('csv') || type.includes('excel') || name.endsWith('.csv') || name.endsWith('.xlsx')) return 'i-lucide-file-spreadsheet'

  return 'i-lucide-file'
}

export function removeRandomSuffix(filename: string): string {
  return filename.replace(/^(.+)-[a-zA-Z0-9]+(\.[^.]+)$/, '$1$2')
}
