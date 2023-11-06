const { ipcRenderer } = require('electron')
let loadingTxt = document.getElementById('loadingTxt')
let progressBar = document.getElementById('progressBar')

let errorMsg = document.getElementById('errorMsg');
ipcRenderer.on('notification-system', (event, arg) => {
  errorMsg.className = 'alert alert-' + arg[0]
  errorMsg.innerHTML = arg[1]
}) 

if (progressBar) {
  ipcRenderer.send('getClient')
}

ipcRenderer.on('send-loading-progress', (event, arg) => {
  loadingTxt.innerHTML = arg[2]
  thePercent = (arg[1] / arg[0]) * 100;
  progressBar.style="width: "+thePercent+"%;";
  progressBar.ariaValueNow=thePercent;
  progressBar.innerHTML = Math.round(thePercent) + '%';
})
