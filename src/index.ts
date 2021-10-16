import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import pie from 'puppeteer-in-electron';
import puppeteer from 'puppeteer-core';
import { Image } from './types';

declare const MAIN_WINDOW_WEBPACK_ENTRY: any;

pie.initialize(app);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  // eslint-disable-line global-require
  app.quit();
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (!app.isPackaged) mainWindow.webContents.openDevTools();
  mainWindow.maximize();
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-response', async (event, args: string) => {
  const browser = await pie.connect(app, puppeteer);
  const pipWindow = new BrowserWindow();
  pipWindow.maximize();
  const url = `https://www.google.de/search?q=${args}&tbm=isch`;
  await pipWindow.loadURL(url);

  const page = await pie.getPage(browser, pipWindow);

  const coords = {
    acceptCookies: {
      x: 951,
      y: 828,
    },
  };

  try {
    const modal = await page.$('[aria-modal=true]');
    if (modal) {
      await page.mouse.click(coords.acceptCookies.x, coords.acceptCookies.y);
    }
  } catch {}

  const images: Image[] = await page.evaluate(() => {
    const ms = Date.now();
    function isRectEmpty(rect: DOMRect) {
      return (
        rect.top === 0 &&
        rect.right === 0 &&
        rect.bottom === 0 &&
        rect.left === 0 &&
        rect.width === 0 &&
        rect.height === 0 &&
        rect.x === 0 &&
        rect.y === 0
      );
    }

    function scrollToBottom(): Promise<void> {
      return new Promise((resolve) => {
        const endElement = document.querySelector('input[type=button]');
        const interval = setInterval(() => {
          window.scrollTo(0, 1000000);
          const isVisible = !isRectEmpty(endElement.getBoundingClientRect());
          if (isVisible) {
            clearInterval(interval);
            resolve();
          }
        }, 500);
      });
    }

    return scrollToBottom().then(() => {
      console.log(Date.now() - ms);

      const selectors = {
        img: '.islrc',
      };

      const imgWrap = document.querySelector<HTMLDivElement>(selectors.img);
      const imageElements = imgWrap.querySelectorAll('img');

      const images = Array.from(imageElements).map((img) => {
        const parent = img.parentElement.parentElement as HTMLElement;
        const nextElement = parent.nextElementSibling as HTMLAnchorElement;

        if (parent.nodeName !== 'A') return undefined;
        if (!parent) return undefined;

        const link = parent as HTMLAnchorElement;

        if (link.href.length > 0) {
          const linkURL = new URL(link.href);
          if (linkURL.host.startsWith('www.google')) return undefined;
        }

        link.click();

        try {
          const imgUrl = new URL(link.href);
          const params = new URLSearchParams(imgUrl.search);
          const urlParam = params.get('imgurl');
          return { url: nextElement.getAttribute('href'), img: urlParam };
        } catch {
          return undefined;
        }
      });

      return images;
    });
  });

  pipWindow.destroy();
  return images.filter((img) => !!img);
});

ipcMain.handle('open-dialog', async (event, args) => {
  const response = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return response;
});

ipcMain.handle('is-packaged', (event, args) => {
  return app.isPackaged;
});
