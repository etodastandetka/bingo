export function createApiResponse<T>(data: T | null, error?: string) {
  if (error) {
    return {
      success: false,
      error,
    }
  }
  return {
    success: true,
    data,
  }
}

