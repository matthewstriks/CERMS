import type { MenuItemConstructorOptions } from 'electron'

export function applicationMenu(
  platform: NodeJS.Platform,
  openAbout: () => void,
  development: boolean,
): MenuItemConstructorOptions[] {
  const about: MenuItemConstructorOptions = {
    id: 'about-cerms',
    label: 'About CERMS',
    click: openAbout,
  }
  return [
    ...(platform === 'darwin'
      ? [
          {
            label: 'CERMS',
            submenu: [
              about,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { role: 'close' },
        ...(platform === 'darwin' ? [] : [{ role: 'quit' } as MenuItemConstructorOptions]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(development
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
    ...(platform !== 'darwin'
      ? [{ label: 'Help', submenu: [about] } as MenuItemConstructorOptions]
      : []),
  ]
}
