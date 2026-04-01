/**
 * Utility để xử lý file từ URL và convert thành format Gemini API chấp nhận
 */

export interface FileContent {
  type: 'image' | 'document'
  mimeType: string
  data: Uint8Array
}

/**
 * Download file từ URL và convert thành Uint8Array
 */
export async function fetchFileAsBuffer(url: string): Promise<Uint8Array> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  } catch (error) {
    console.error('Error fetching file:', error)
    throw new Error(`Could not download file from URL: ${url}`)
  }
}

/**
 * Convert Buffer/Uint8Array to base64 string
 */
export function bufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  const len = buffer.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]!)
  }
  return btoa(binary)
}

/**
 * Process uploaded file URL and convert to Gemini-compatible format
 * Returns object suitable for Gemini API
 */
export async function processFileForGemini(fileUrl: string, mimeType: string) {
  // Support both uploaded blob URLs and direct URLs
  if (mimeType.startsWith('image/')) {
    // For images, return URL directly - Gemini can process image URLs
    return {
      type: 'image',
      mimeType,
      url: fileUrl // Gemini supports direct image URLs
    }
  } else {
    // For non-image files (PDF, CSV, etc.), download and convert to base64
    const buffer = await fetchFileAsBuffer(fileUrl)
    const base64 = bufferToBase64(buffer)

    return {
      type: 'document',
      mimeType,
      base64,
      data: buffer
    }
  }
}
