import type { MenuItemConstructorOptions } from 'electron'

export function applicationMenu(
  platform: NodeJS.Platform,
  openAbout: () => void,
  development: boolean,
  newMember: () => void,
  newOrder: () => void,
  checkForUpdates: () => void = () => {},
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
              { id: 'check-for-updates', label: 'Check for Updates…', click: checkForUpdates },
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
        {
          id: 'new-member',
          label: 'New Member…',
          accelerator: 'CommandOrControl+Shift+N',
          enabled: false,
          click: newMember,
        },
        {
          id: 'new-order',
          label: 'New Order…',
          accelerator: 'CommandOrControl+Shift+O',
          enabled: false,
          click: newOrder,
        },
        { type: 'separator' },
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
      ? [
          {
            label: 'Help',
            submenu: [
              about,
              { id: 'check-for-updates', label: 'Check for Updates…', click: checkForUpdates },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
  ]
}
