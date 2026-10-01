import { BrowserWindow } from 'electron'
let printing = false
export async function printReceipt(source: BrowserWindow, request: unknown): Promise<void> {
  const d = request as { text?: unknown; printer?: unknown; width?: unknown }
  if (
    !d ||
    typeof d.text !== 'string' ||
    d.text.length > 50000 ||
    typeof d.printer !== 'string' ||
    d.printer.length > 300 ||
    ![58, 80].includes(Number(d.width))
  )
    throw new Error('Invalid receipt print request.')
  if (printing) throw new Error('A receipt is already being printed.')
  printing = true
  let win: BrowserWindow | null = null
  try {
    const printers = await source.webContents.getPrintersAsync()
    if (d.printer && !printers.some((p) => p.name === d.printer))
      throw new Error(
        'Selected printer is unavailable. Check its connection or select another printer.',
      )
    win = new BrowserWindow({
      show: false,
      width: 400,
      height: 600,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        javascript: false,
      },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    const escaped = d.text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    )
    await win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{margin:0}body{margin:3mm;width:${Number(d.width) - 8}mm;color:#000}pre{font:11px monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}</style></head><body><pre>${escaped}</pre></body></html>`,
        ),
    )
    await new Promise<void>((resolve, reject) =>
      win!.webContents.print(
        {
          silent: false,
          deviceName: d.printer as string,
          color: false,
          printBackground: false,
          margins: { marginType: 'none' },
          usePrinterDefaultPageSize: true,
        },
        (ok, reason) =>
          ok
            ? resolve()
            : reject(new Error(reason || 'Receipt printing failed. The sale remains saved.')),
      ),
    )
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    printing = false
  }
}
