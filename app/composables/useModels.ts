import { MODELS } from '#shared/utils/models'

export function useModels() {
  const model = useCookie<string>('model', { default: () => MODELS[0]?.value || 'google/gemini-1.5-flash' })

  // Tự động nhận diện và xoá các giá trị cookie cũ không còn hiệu lực
  if (!MODELS.some(m => m.value === model.value)) {
    model.value = MODELS[0]?.value || 'google/gemini-1.5-flash'
  }

  return {
    models: MODELS,
    model
  }
}
