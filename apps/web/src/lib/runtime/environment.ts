export function allowsIntegrationMock(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'
}
