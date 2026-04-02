import { sign } from 'hono/jwt' // Actually, let's use a simpler way or native fetch if possible.
// Given Cloudflare environment, we'll use a direct REST call.

export async function fetchFirestoreCollection(collection: string) {
  const config = useRuntimeConfig()
  const projectId = config.fbProjectId || 'dunvex-89461'
  const apiKey = config.fbApiKey // If using API Key
  
  // Base URL for Firestore REST API
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?key=${apiKey}`

  const response = await fetch(url)
  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Firestore REST error: ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  return data.documents || []
}

export function parseFirestoreDocument(doc: any) {
  const fields = doc.fields || {}
  const res: any = { id: doc.name.split('/').pop() }
  
  for (const [key, value] of Object.entries(fields)) {
    // Basic mapping for Firestore REST types
    if ((value as any).stringValue) res[key] = (value as any).stringValue
    else if ((value as any).integerValue) res[key] = parseInt((value as any).integerValue)
    else if ((value as any).doubleValue) res[key] = parseFloat((value as any).doubleValue)
    else if ((value as any).booleanValue) res[key] = (value as any).booleanValue
    else if ((value as any).timestampValue) res[key] = (value as any).timestampValue
    else res[key] = JSON.stringify(value)
  }
  
  return res
}
