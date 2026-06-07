export const getPublicUrlFromPresigned = (presignedUrl: string): string => {
  const url = new URL(presignedUrl)
  url.search = ''
  return url.toString()
}
