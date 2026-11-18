/** Keep the original bytes; give downloads a useful media type and filename. */
export function supportFileType(name: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase() || ''
  return (
    (
      {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        heic: 'image/heic',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        txt: 'text/plain',
        log: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        zip: 'application/zip',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as Record<string, string>
    )[extension] || 'application/octet-stream'
  )
}
