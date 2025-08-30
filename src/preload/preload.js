const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getGames: () => ipcRenderer.invoke('get-games'),  
    launchGame: (appid) => ipcRenderer.invoke('launch-game', appid)
});
